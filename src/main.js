import { ethers } from 'ethers';
import { gsap } from 'gsap';
import { AppKit } from '@circle-fin/app-kit';
import { ArcTestnet } from '@circle-fin/app-kit/chains';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { Buffer } from 'buffer';

window.ethers = ethers;
window.gsap = gsap;
window.Buffer = window.Buffer || Buffer;

const CIRCLE_API_ORIGIN = 'https://api.circle.com';
const CIRCLE_API_PROXY_PREFIX = '/api/circle';
const nativeFetch = window.fetch.bind(window);

window.fetch = (input, init) => {
  const requestUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input?.url;

  if (requestUrl?.startsWith(`${CIRCLE_API_ORIGIN}/v1/stablecoinKits/`)) {
    const proxyUrl = requestUrl.replace(CIRCLE_API_ORIGIN, CIRCLE_API_PROXY_PREFIX);
    return nativeFetch(proxyUrl, init);
  }

  return nativeFetch(input, init);
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');
const starCount = 350;
const cyanStars = 8;
const ARC_TESTNET = {
  chainId: '0x4CEF52',
  chainName: 'Arc Testnet',
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18
  }
};
const ARCVAULT_ADDRESS = '0xf6BEB2719018814fa034006Fa1e7Be5a4f08D21c';
const YUSDC_ADDRESS = '0xF9a536cbb52a6AEC3b233883958bB4b6102156bA';
const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const ARC_EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const ARC_CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';
const TOKEN_DECIMALS = 6;
const KEEPER_RUN_HOUR_UTC = 18;
const SWAP_SLIPPAGE_BPS = 100;
const APP_KIT_CHAIN = 'Arc_Testnet';
const CIRCLE_KIT_KEY = import.meta.env.VITE_CIRCLE_KIT_KEY || '';
const SWAP_TOKENS = {
  eurc: {
    name: 'EURC',
    symbol: 'EURC',
    appKitSymbol: 'EURC',
    address: ARC_EURC_ADDRESS,
    decimals: 6
  },
  cirbtc: {
    name: 'cirBTC',
    symbol: 'cirBTC',
    appKitSymbol: 'cirBTC',
    address: ARC_CIRBTC_ADDRESS,
    decimals: 8
  }
};
const circleAppKit = new AppKit();
const ARCVAULT_ABI = [
  'function deposit(uint256 amount) returns (uint256 shares)',
  'function withdraw(uint256 shares) returns (uint256 assets)',
  'function compound() returns (uint256 yieldAssets)',
  'function totalAssets() view returns (uint256 assets)',
  'function convertToShares(uint256 assets) view returns (uint256 shares)',
  'function convertToAssets(uint256 shares) view returns (uint256 assets)',
  'function keeper() view returns (address)',
  'function strategy() view returns (address)',
  'event Deposited(address indexed user, uint256 assets, uint256 shares)',
  'event Withdrawn(address indexed user, uint256 assets, uint256 shares)',
  'event Compounded(address indexed keeper, uint256 yieldAssets, uint256 totalAssetsAfter)'
];
const YUSDC_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)'
];
const STRATEGY_ABI = [
  'function totalAssets() view returns (uint256)',
  'function lastUpdated() view returns (uint256)',
  'function harvestCount() view returns (uint256)',
  'function pendingYield() view returns (uint256)'
];
const USDC_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 value) returns (bool)'
];
const ERC20_ABI = USDC_ABI;
const READ_PROVIDER = new window.ethers.JsonRpcProvider(ARC_TESTNET.rpcUrls[0]);
let stars = [];
let frameId = 0;
let connected = false;
let toastTimer = 0;
let swapQuoteTimer = 0;
let swapQuoteRequest = 0;

const appState = {
  contractDeployed: true,
  address: '',
  walletUsdc: 0,
  vaultUsdc: 0,
  netApy: null,
  apyIsProjected: false,
  lastCompoundTimestamp: null,
  lastStrategyUpdateTimestamp: null,
  strategyHarvestCount: 0,
  pendingYieldUsdc: null,
  userShares: 0,
  withdrawableUsdc: 0,
  dayEarned: null,
  depositedUsdc: 0,
  personalEarned: 0,
  exchangeRate: 1,
  strategy: 'Active',
  health: 'Idle',
  isKeeper: false,
  keeper: '',
  swapToken: 'eurc',
  swapBalance: 0,
  swapAmountRaw: 0n,
  swapQuoteRaw: 0n,
  swapMinOutRaw: 0n,
  swapEstimateUsdc: 0,
  swapMinUsdc: 0,
  swapLoading: false,
  swapError: '',
  swapResultHash: ''
};

function loadDepositBasis(address) {
  const key = `arcvault:basis:${address.toLowerCase()}`;
  return parseFloat(localStorage.getItem(key) || '0');
}

function saveDepositBasis(address, usdcAmount) {
  const key = `arcvault:basis:${address.toLowerCase()}`;
  const current = loadDepositBasis(address);
  localStorage.setItem(key, String(current + usdcAmount));
}

function clearDepositBasis(address) {
  localStorage.removeItem(`arcvault:basis:${address.toLowerCase()}`);
}

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const oldWidth = canvas.width / (canvas.dataset.dpr || dpr) || window.innerWidth;
  const oldHeight = canvas.height / (canvas.dataset.dpr || dpr) || window.innerHeight;
  const nextWidth = window.innerWidth;
  const nextHeight = window.innerHeight;

  canvas.dataset.dpr = dpr;
  canvas.width = Math.floor(nextWidth * dpr);
  canvas.height = Math.floor(nextHeight * dpr);
  canvas.style.width = `${nextWidth}px`;
  canvas.style.height = `${nextHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (stars.length) {
    stars = stars.map((star) => ({
      ...star,
      x: (star.x / oldWidth) * nextWidth,
      y: (star.y / oldHeight) * nextHeight
    }));
  } else {
    seedStars(nextWidth, nextHeight);
  }
}

function seedStars(width, height) {
  stars = Array.from({ length: starCount }, (_, index) => {
    const tier = Math.random();
    const radius = tier > 0.975
      ? randomBetween(1.5, 2.2)
      : tier > 0.74
        ? randomBetween(0.9, 1.4)
        : randomBetween(0.4, 0.8);

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius,
      phase: Math.random() * Math.PI * 2,
      speed: randomBetween(0.0004, 0.0012),
      tint: index < cyanStars
    };
  }).sort(() => Math.random() - 0.5);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function renderStars(time) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);

  for (const star of stars) {
    const wave = Math.sin(time * star.speed + star.phase);
    const opacity = 0.2 + ((wave + 1) / 2) * 0.8;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = star.tint
      ? `rgba(79, 195, 247, ${Math.min(opacity, 0.8)})`
      : `rgba(232, 234, 240, ${opacity})`;
    ctx.fill();
  }

  frameId = requestAnimationFrame(renderStars);
}

function setupReveal() {
  const sections = document.querySelectorAll('.reveal');

  if (reduceMotion.matches) {
    sections.forEach((section) => section.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  sections.forEach((section) => observer.observe(section));
}

function setupGsapAnimations() {
  const runHeroEntrance = () => {
    if (window.gsap && !reduceMotion.matches) {
      window.gsap.from('.metric', { y: 24, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out', delay: 0.2 });
      window.gsap.from('.vault-card', { y: 32, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 0.1 });
      window.gsap.from('.mission h1', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out' });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runHeroEntrance, { once: true });
  } else {
    runHeroEntrance();
  }

  let wasConnected = document.body.classList.contains('wallet-connected');
  const walletObserver = new MutationObserver(() => {
    const isConnected = document.body.classList.contains('wallet-connected');
    if (isConnected && !wasConnected && window.gsap && !reduceMotion.matches) {
      window.gsap.from('.position-cell', { y: 20, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(1.4)' });
    }
    wasConnected = isConnected;
  });

  walletObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function setupTabs() {
  const triggers = document.querySelectorAll('[data-tab-trigger]');
  let activeTab = 'deposit';

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const nextTab = trigger.dataset.tabTrigger;
      if (nextTab === activeTab) return;

      const currentPanel = document.querySelector(`[data-tab-panel="${activeTab}"]`);
      const nextPanel = document.querySelector(`[data-tab-panel="${nextTab}"]`);

      triggers.forEach((button) => {
        const selected = button.dataset.tabTrigger === nextTab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
      });

      currentPanel.classList.remove('active');
      currentPanel.classList.add('exiting');

      window.setTimeout(() => {
        currentPanel.classList.remove('exiting');
        nextPanel.classList.add('active');
        activeTab = nextTab;
      }, reduceMotion.matches ? 0 : 180);
    });
  });
}

function setupWallet() {
  const connectButton = document.getElementById('connectWallet');
  const positionConnect = document.getElementById('positionConnect');

  connectButton.addEventListener('click', connectWallet);
  positionConnect.addEventListener('click', connectWallet);

  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', (accounts) => {
      if (!accounts.length) {
        applyWalletConnectedState(false);
        showToast('Wallet disconnected.');
        return;
      }

      updateConnectedWallet(accounts[0]);
    });

    window.ethereum.on?.('chainChanged', async () => {
      if (connected) {
        await refreshOnchainState();
      }
    });
  }
}

async function connectWallet() {
  const connectButton = document.getElementById('connectWallet');

  if (!window.ethereum) {
    showToast('No MetaMask wallet detected. Install MetaMask to connect.');
    return;
  }

  if (!window.ethers) {
    showToast('Wallet library is still loading. Try again in a moment.');
    return;
  }

  try {
    connectButton.disabled = true;
    connectButton.classList.add('is-busy');
    connectButton.textContent = 'Connecting';

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    await ensureArcTestnet();
    await updateConnectedWallet(accounts[0]);
  } catch (error) {
    handleWalletError(error);
  } finally {
    connectButton.disabled = false;
    connectButton.classList.remove('is-busy');
    connectButton.textContent = connected ? 'Connected' : 'Connect Wallet';
  }
}

async function ensureArcTestnet() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET.chainId }]
    });
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_TESTNET]
      });
      return;
    }

    throw error;
  }
}

async function updateConnectedWallet(address) {
  appState.address = address;
  await refreshOnchainState();
  setWalletConnected(true);
}

async function refreshWalletBalance() {
  await refreshOnchainState();
}

function getReadContracts() {
  return {
    vault: new window.ethers.Contract(ARCVAULT_ADDRESS, ARCVAULT_ABI, READ_PROVIDER),
    yusdc: new window.ethers.Contract(YUSDC_ADDRESS, YUSDC_ABI, READ_PROVIDER),
    usdc: new window.ethers.Contract(ARC_USDC_ADDRESS, USDC_ABI, READ_PROVIDER)
  };
}

async function getActiveStrategyContract(vault) {
  const strategyAddress = await vault.strategy();
  if (strategyAddress === window.ethers.ZeroAddress) return null;
  return new window.ethers.Contract(strategyAddress, STRATEGY_ABI, READ_PROVIDER);
}

async function getWriteContracts() {
  const provider = new window.ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  return {
    provider,
    signer,
    vault: new window.ethers.Contract(ARCVAULT_ADDRESS, ARCVAULT_ABI, signer),
    yusdc: new window.ethers.Contract(YUSDC_ADDRESS, YUSDC_ABI, signer),
    usdc: new window.ethers.Contract(ARC_USDC_ADDRESS, USDC_ABI, signer)
  };
}

async function refreshOnchainState() {
  if (!window.ethers) return;

  try {
    const { vault, yusdc, usdc } = getReadContracts();
    const reads = [vault.totalAssets(), yusdc.totalSupply(), vault.keeper(), getActiveStrategyContract(vault)];

    if (appState.address) {
      reads.push(
        usdc.balanceOf(appState.address),
        yusdc.balanceOf(appState.address),
        usdc.allowance(appState.address, ARCVAULT_ADDRESS)
      );
    }

    const [
      totalAssets,
      totalSupply,
      keeperAddress,
      strategy,
      usdcBalance = 0n,
      sharesBalance = 0n,
      allowance = 0n
    ] = await Promise.all(reads);
    const [strategyAssets, strategyLastUpdated, strategyHarvestCount, pendingYield] = strategy
      ? await Promise.all([
          strategy.totalAssets(),
          strategy.lastUpdated().catch(() => 0n),
          strategy.harvestCount().catch(() => 0n),
          strategy.pendingYield().catch(() => null)
        ])
      : [0n, 0n, 0n, null];
    console.log('Strategy assets:', window.ethers.formatUnits(strategyAssets, 6), 'USDC');

    appState.vaultUsdc = Number(window.ethers.formatUnits(totalAssets, TOKEN_DECIMALS));
    appState.walletUsdc = appState.address ? Number(window.ethers.formatUnits(usdcBalance, TOKEN_DECIMALS)) : appState.walletUsdc;
    appState.userShares = appState.address ? Number(window.ethers.formatUnits(sharesBalance, TOKEN_DECIMALS)) : appState.userShares;
    appState.withdrawableUsdc = appState.userShares > 0
      ? Number(window.ethers.formatUnits(await vault.convertToAssets(sharesBalance), TOKEN_DECIMALS))
      : 0;
    appState.depositedUsdc = appState.address ? loadDepositBasis(appState.address) : appState.depositedUsdc;
    appState.personalEarned = Math.max(0, appState.withdrawableUsdc - appState.depositedUsdc);
    appState.exchangeRate = totalSupply > 0n
      ? Number(window.ethers.formatUnits((totalAssets * 1000000n) / totalSupply, TOKEN_DECIMALS))
      : 1;
    appState.lastStrategyUpdateTimestamp = strategyLastUpdated > 0n ? Number(strategyLastUpdated) * 1000 : appState.lastStrategyUpdateTimestamp;
    appState.strategyHarvestCount = Number(strategyHarvestCount);
    appState.pendingYieldUsdc = pendingYield === null ? appState.pendingYieldUsdc : Number(window.ethers.formatUnits(pendingYield, TOKEN_DECIMALS));
    appState.keeper = keeperAddress;
    appState.isKeeper = Boolean(
      appState.address &&
      keeperAddress &&
      appState.address.toLowerCase() === keeperAddress.toLowerCase()
    );
    appState.contractDeployed = true;
    updateApprovalHint(appState.address && allowance === 0n);
    renderAppState();
    queueSwapStateRefresh();
  } catch (error) {
    console.error(error);
    showToast('Connected, but vault data could not be loaded.');
  }
}

async function queryLatestEventInRange(contract, filter, blockSpan = 250000, chunkSize = 9500) {
  const latestBlock = await READ_PROVIDER.getBlockNumber();
  const oldestBlock = Math.max(0, latestBlock - blockSpan);

  for (let endBlock = latestBlock; endBlock >= oldestBlock; endBlock -= chunkSize) {
    const startBlock = Math.max(oldestBlock, endBlock - chunkSize + 1);
    const events = await contract.queryFilter(filter, startBlock, endBlock);

    if (events.length) {
      return events.sort((a, b) => {
        const blockDelta = b.blockNumber - a.blockNumber;
        if (blockDelta !== 0) return blockDelta;
        return (b.index ?? b.logIndex ?? 0) - (a.index ?? a.logIndex ?? 0);
      })[0];
    }
  }

  return null;
}

async function loadEventHistory() {
  if (!window.ethers) return;

  try {
    const { vault } = getReadContracts();
    const strategy = await getActiveStrategyContract(vault);
    const [depositEvents, withdrawEvents, compoundEvents] = await Promise.all([
      vault.queryFilter(vault.filters.Deposited(), -2000),
      vault.queryFilter(vault.filters.Withdrawn(), -2000),
      vault.queryFilter(vault.filters.Compounded(), -2000)
    ]);
    const events = [...depositEvents, ...withdrawEvents, ...compoundEvents]
      .sort((a, b) => {
        const blockDelta = b.blockNumber - a.blockNumber;
        if (blockDelta !== 0) return blockDelta;
        return (b.index ?? b.logIndex ?? 0) - (a.index ?? a.logIndex ?? 0);
      })
      .slice(0, 20);

    let latestCompound = compoundEvents
      .slice()
      .sort((a, b) => {
        const blockDelta = b.blockNumber - a.blockNumber;
        if (blockDelta !== 0) return blockDelta;
        return (b.index ?? b.logIndex ?? 0) - (a.index ?? a.logIndex ?? 0);
      })[0];

    if (!latestCompound) {
      latestCompound = await queryLatestEventInRange(vault, vault.filters.Compounded());
    }

    if (latestCompound) {
      const yieldAssets = latestCompound.args.yieldAssets ?? latestCompound.args[1];
      const totalAssetsAfter = latestCompound.args.totalAssetsAfter ?? latestCompound.args[2];
      const yieldUsdc = Number(window.ethers.formatUnits(yieldAssets, TOKEN_DECIMALS));
      const totalAfterUsdc = Number(window.ethers.formatUnits(totalAssetsAfter, TOKEN_DECIMALS));
      const preCompoundUsdc = totalAfterUsdc - yieldUsdc;
      const dailyRate = preCompoundUsdc > 0 ? yieldUsdc / preCompoundUsdc : 0;
      const compoundBlock = await READ_PROVIDER.getBlock(latestCompound.blockNumber);

      appState.netApy = ((1 + dailyRate) ** 365 - 1) * 100;
      appState.apyIsProjected = false;
      appState.lastCompoundTimestamp = compoundBlock ? compoundBlock.timestamp * 1000 : null;
      appState.lastStrategyUpdateTimestamp = appState.lastCompoundTimestamp || appState.lastStrategyUpdateTimestamp;
      renderAppState();
    } else if (strategy) {
      const strategyAssets = await strategy.totalAssets();
      const strategyAssetsUsdc = Number(window.ethers.formatUnits(strategyAssets, TOKEN_DECIMALS));
      const projectedYield = strategyAssetsUsdc * 0.001;
      const projectedDailyRate = strategyAssetsUsdc > 0 ? projectedYield / strategyAssetsUsdc : 0;

      appState.netApy = ((1 + projectedDailyRate) ** 365 - 1) * 100;
      appState.apyIsProjected = true;
      appState.lastCompoundTimestamp = null;
      renderAppState();
    } else {
      appState.netApy = null;
      appState.apyIsProjected = false;
      appState.lastCompoundTimestamp = null;
      renderAppState();
    }

    if (!events.length) return;

    const timeline = document.getElementById('timeline');
    timeline.querySelector('.tx-empty')?.remove();

    events.forEach((event) => {
      if (event.fragment?.name === 'Deposited') {
        const assets = event.args.assets ?? event.args[1];
        const amount = Number(window.ethers.formatUnits(assets, TOKEN_DECIMALS));
        addActivity('Deposit', `+${formatNumber(amount, 2)} USDC`, 'yUSDC minted', event.transactionHash, { isNew: false, placement: 'append' });
        return;
      }

      if (event.fragment?.name === 'Withdrawn') {
        const shares = event.args.shares ?? event.args[2];
        const amount = Number(window.ethers.formatUnits(shares, TOKEN_DECIMALS));
        addActivity('Withdraw', `-${formatNumber(amount, 2)} yUSDC`, 'yUSDC burned', event.transactionHash, { isNew: false, placement: 'append' });
        return;
      }

      if (event.fragment?.name === 'Compounded') {
        const yieldAssets = event.args.yieldAssets ?? event.args[1];
        const amount = Number(window.ethers.formatUnits(yieldAssets, TOKEN_DECIMALS));
        addActivity('Compound', `+${formatNumber(amount, 2)} USDC yield`, 'keeper executed', event.transactionHash, { isNew: false, placement: 'append' });
      }
    });
  } catch (error) {
    console.error(error);
  }
}

function handleWalletError(error) {
  if (error?.code === 4001) {
    showToast('Wallet connection rejected.');
    return;
  }

  if (error?.code === 4902) {
    showToast('Arc Testnet was not added to your wallet.');
    return;
  }

  if (String(error?.message || '').toLowerCase().includes('chain')) {
    showToast('Could not switch to Arc Testnet.');
    return;
  }

  showToast('Wallet connection failed. Please try again.');
}

function setWalletConnected(isConnected) {
  const connectButton = document.getElementById('connectWallet');
  const walletState = document.getElementById('walletState');
  const positionPanel = document.getElementById('positionPanel');
  const positionPlaceholder = document.getElementById('positionPlaceholder');

  if (isConnected && !connected && !reduceMotion.matches) {
    positionPlaceholder.classList.add('exiting');
    window.setTimeout(() => {
      applyWalletConnectedState(true);
      positionPlaceholder.classList.remove('exiting');
    }, 200);
    return;
  }

  applyWalletConnectedState(isConnected);
}

function applyWalletConnectedState(isConnected) {
  const connectButton = document.getElementById('connectWallet');
  const walletState = document.getElementById('walletState');
  const positionPanel = document.getElementById('positionPanel');

  connected = isConnected;
  document.body.classList.toggle('wallet-connected', connected);
  walletState.classList.toggle('connected', connected);
  connectButton.textContent = connected ? 'Connected' : 'Connect Wallet';
  setHealth(connected ? 'Withdraw Ready' : 'Idle');
  if (!connected) updateApprovalHint(false);
  if (connected && !reduceMotion.matches) {
    positionPanel.classList.remove('panel-enter');
    void positionPanel.offsetWidth;
    positionPanel.classList.add('panel-enter');
  }
  showToast(connected ? 'Wallet connected on Arc Testnet.' : 'Wallet disconnected.');
  renderAppState();
  queueSwapStateRefresh();
}

function updateApprovalHint(isVisible) {
  const hint = document.getElementById('depositApprovalHint');
  if (hint) hint.hidden = !isVisible;
}

function setupSwapActions() {
  const swapAmount = document.getElementById('swapAmount');
  const swapToken = document.getElementById('swapToken');
  const swapTokenButton = document.getElementById('swapTokenButton');
  const swapTokenPicker = document.getElementById('swapTokenPicker');
  const swapTokenMenu = document.getElementById('swapTokenMenu');
  const swapTokenOptions = document.querySelectorAll('.token-option');
  const swapAction = document.getElementById('swapAction');
  const useUsdcForDeposit = document.getElementById('useUsdcForDeposit');
  const depositInput = document.getElementById('depositAmount');

  swapAmount.addEventListener('input', () => {
    renderSwapState();
    queueSwapStateRefresh();
  });
  swapTokenButton.addEventListener('click', () => {
    setTokenMenuOpen(!swapTokenPicker.classList.contains('open'));
  });

  swapTokenOptions.forEach((option) => {
    option.addEventListener('click', () => {
      setSwapToken(option.dataset.value);
      setTokenMenuOpen(false);
      renderSwapState();
      queueSwapStateRefresh();
    });
  });

  document.addEventListener('click', (event) => {
    if (!swapTokenPicker.contains(event.target)) {
      setTokenMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setTokenMenuOpen(false);
    }
  });

  swapAction.addEventListener('click', async () => {
    await runSwap(swapAction);
  });

  useUsdcForDeposit.addEventListener('click', async () => {
    if (connected) {
      await refreshOnchainState();
    }

    const requestedAmount = readPositiveAmount(swapAmount.value);
    const amount = connected && appState.walletUsdc > 0
      ? Math.min(requestedAmount || appState.walletUsdc, appState.walletUsdc)
      : requestedAmount;

    if (!amount) {
      showToast(connected ? 'No USDC balance available yet.' : 'Enter an amount or connect wallet first.');
      return;
    }

    depositInput.value = trimTokenAmount(String(amount), 6);
    document.querySelector('[data-tab-trigger="deposit"]')?.click();
    document.querySelector('.vault-card')?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
    renderAppState();
    showToast('Deposit amount updated.');
  });

  function setTokenMenuOpen(isOpen) {
    swapTokenPicker.classList.toggle('open', isOpen);
    swapTokenButton.setAttribute('aria-expanded', String(isOpen));

    if (window.gsap && !reduceMotion.matches) {
      window.gsap.killTweensOf(swapTokenMenu);
      window.gsap.to(swapTokenMenu, {
        autoAlpha: isOpen ? 1 : 0,
        y: isOpen ? 0 : -6,
        scale: isOpen ? 1 : 0.98,
        duration: isOpen ? 0.22 : 0.16,
        ease: isOpen ? 'power3.out' : 'power2.in',
        pointerEvents: isOpen ? 'auto' : 'none'
      });
    } else {
      swapTokenMenu.style.opacity = isOpen ? '1' : '0';
      swapTokenMenu.style.transform = isOpen ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.98)';
      swapTokenMenu.style.pointerEvents = isOpen ? 'auto' : 'none';
    }
  }

  function setSwapToken(value) {
    const selectedOption = [...swapTokenOptions].find((option) => option.dataset.value === value) || swapTokenOptions[0];
    const label = selectedOption.querySelector('span')?.textContent || 'Choose token';

    swapToken.value = selectedOption.dataset.value;
    appState.swapToken = selectedOption.dataset.value;
    document.getElementById('swapTokenLabel').textContent = label;
    swapTokenMenu.setAttribute('aria-activedescendant', selectedOption.id);
    swapTokenOptions.forEach((option) => {
      option.setAttribute('aria-selected', String(option === selectedOption));
    });
  }

  renderSwapState();
  queueSwapStateRefresh();
}

function renderSwapState() {
  const swapAmount = document.getElementById('swapAmount');
  const swapToken = document.getElementById('swapToken');
  const swapBalance = document.getElementById('swapBalance');
  const swapEstimate = document.getElementById('swapEstimate');
  const swapMinReceived = document.getElementById('swapMinReceived');
  const swapRoute = document.getElementById('swapRoute');
  const swapStatus = document.getElementById('swapStatus');
  const swapAction = document.getElementById('swapAction');
  if (!swapAmount || !swapToken || !swapBalance || !swapEstimate || !swapMinReceived || !swapRoute || !swapStatus || !swapAction) return;

  const amount = readPositiveAmount(swapAmount.value);
  const selectedToken = getSwapTokenConfig(swapToken.value);
  const hasQuote = appState.swapQuoteRaw > 0n;
  const exceedsBalance = connected && amount > appState.swapBalance;
  const hasKitKey = hasCircleKitKey();

  swapBalance.textContent = connected
    ? `${formatNumber(appState.swapBalance, selectedToken.decimals === 8 ? 6 : 2)} ${selectedToken.symbol}`
    : '--';

  swapEstimate.textContent = hasQuote ? `${formatNumber(appState.swapEstimateUsdc, 2)} USDC` : '--';
  swapMinReceived.textContent = hasQuote ? `${formatNumber(appState.swapMinUsdc, 2)} USDC` : '--';
  swapRoute.textContent = `Powered by Circle App Kit`;

  if (!hasKitKey) {
    swapStatus.textContent = 'Swap temporarily unavailable — try again shortly.';
    swapAction.disabled = true;
    swapAction.textContent = 'Swap unavailable';
    return;
  }

  if (!connected) {
    swapStatus.textContent = 'Connect wallet to preview a USDC swap.';
    swapAction.disabled = false;
    swapAction.textContent = 'Connect Wallet';
    return;
  }

  if (!amount) {
    swapStatus.textContent = 'Enter an amount to preview the swap.';
    swapAction.disabled = true;
    swapAction.textContent = 'Enter amount';
    return;
  }

  if (appState.swapLoading) {
    swapStatus.textContent = 'Checking swap quote...';
    swapAction.disabled = true;
    swapAction.textContent = 'Checking quote';
    return;
  }

  if (appState.swapError) {
    swapStatus.textContent = appState.swapError;
    swapAction.disabled = true;
    swapAction.textContent = 'Quote unavailable';
    return;
  }

  if (exceedsBalance) {
    swapStatus.textContent = `Insufficient ${selectedToken.symbol} balance.`;
    swapAction.disabled = true;
    swapAction.textContent = `Insufficient ${selectedToken.symbol}`;
    return;
  }

  if (!hasQuote) {
    swapStatus.textContent = 'No swap quote available for this amount.';
    swapAction.disabled = true;
    swapAction.textContent = 'Quote unavailable';
    return;
  }

  swapStatus.textContent = 'Swap first, then deposit USDC into ArcVault.';
  swapAction.disabled = false;
  swapAction.textContent = 'Swap to USDC';
}

function hasCircleKitKey() {
  return Boolean(CIRCLE_KIT_KEY && CIRCLE_KIT_KEY.trim());
}

function getSwapTokenConfig(value) {
  return SWAP_TOKENS[value] || SWAP_TOKENS.eurc;
}

function parseSwapAmount(amount, decimals) {
  if (!amount) return 0n;

  try {
    return window.ethers.parseUnits(trimTokenAmount(String(amount), decimals), decimals);
  } catch (error) {
    return 0n;
  }
}

function getCircleSwapAmount(amount, decimals) {
  if (!amount) return '';
  return trimTokenAmount(String(amount), decimals);
}

async function getCircleSwapAdapter() {
  if (!window.ethereum) {
    throw new Error('Wallet provider not found.');
  }

  return createViemAdapterFromProvider({
    provider: window.ethereum,
    capabilities: {
      addressContext: 'user-controlled',
      supportedChains: [ArcTestnet]
    }
  });
}

function buildCircleSwapParams(adapter, selectedToken, amount) {
  return {
    from: {
      adapter,
      chain: APP_KIT_CHAIN
    },
    tokenIn: selectedToken.appKitSymbol,
    tokenOut: 'USDC',
    amountIn: getCircleSwapAmount(amount, selectedToken.decimals),
    config: {
      kitKey: CIRCLE_KIT_KEY,
      slippageBps: SWAP_SLIPPAGE_BPS
    }
  };
}

function getAppKitErrorMessage(error) {
  return 'Swap temporarily unavailable — try again shortly.';
}

function formatCircleAmountOut(amountOut) {
  if (!amountOut) return Number(appState.swapEstimateUsdc || 0);
  const value = String(amountOut);

  if (value.includes('.')) {
    return Number(value);
  }

  return Number(window.ethers.formatUnits(BigInt(value), TOKEN_DECIMALS));
}

function queueSwapStateRefresh() {
  window.clearTimeout(swapQuoteTimer);
  swapQuoteTimer = window.setTimeout(refreshSwapState, 220);
}

async function refreshSwapState() {
  if (!window.ethers) return;

  const swapAmount = document.getElementById('swapAmount');
  const swapToken = document.getElementById('swapToken');
  if (!swapAmount || !swapToken) return;

  const requestId = ++swapQuoteRequest;
  const tokenKey = swapToken.value || appState.swapToken;
  const token = getSwapTokenConfig(tokenKey);
  const amount = readPositiveAmount(swapAmount.value);
  const amountRaw = parseSwapAmount(amount, token.decimals);

  appState.swapToken = tokenKey;
  appState.swapLoading = Boolean(hasCircleKitKey() && connected);
  appState.swapError = '';
  renderSwapState();

  try {
    const tokenContract = new window.ethers.Contract(token.address, ERC20_ABI, READ_PROVIDER);
    const balanceRaw = appState.address ? await tokenContract.balanceOf(appState.address) : 0n;

    if (requestId !== swapQuoteRequest) return;

    appState.swapAmountRaw = amountRaw;
    appState.swapBalance = Number(window.ethers.formatUnits(balanceRaw, token.decimals));

    if (!hasCircleKitKey()) {
      appState.swapQuoteRaw = 0n;
      appState.swapMinOutRaw = 0n;
      appState.swapEstimateUsdc = 0;
      appState.swapMinUsdc = 0;
      return;
    }

    if (!connected || !amountRaw) {
      appState.swapQuoteRaw = 0n;
      appState.swapMinOutRaw = 0n;
      appState.swapEstimateUsdc = 0;
      appState.swapMinUsdc = 0;
      return;
    }

    const adapter = await getCircleSwapAdapter();
    const estimate = await circleAppKit.estimateSwap(buildCircleSwapParams(adapter, token, amount));

    if (requestId !== swapQuoteRequest) return;

    const quoteRaw = window.ethers.parseUnits(trimTokenAmount(estimate.estimatedOutput.amount, TOKEN_DECIMALS), TOKEN_DECIMALS);
    const minOutRaw = window.ethers.parseUnits(trimTokenAmount(estimate.stopLimit.amount, TOKEN_DECIMALS), TOKEN_DECIMALS);
    appState.swapQuoteRaw = quoteRaw;
    appState.swapMinOutRaw = minOutRaw;
    appState.swapEstimateUsdc = Number(window.ethers.formatUnits(quoteRaw, TOKEN_DECIMALS));
    appState.swapMinUsdc = Number(window.ethers.formatUnits(minOutRaw, TOKEN_DECIMALS));
  } catch (error) {
    if (requestId !== swapQuoteRequest) return;
    console.error(error);
    appState.swapError = getAppKitErrorMessage(error);
    appState.swapQuoteRaw = 0n;
    appState.swapMinOutRaw = 0n;
  } finally {
    if (requestId === swapQuoteRequest) {
      appState.swapLoading = false;
      renderSwapState();
    }
  }
}

async function runSwap(button) {
  const swapAmount = document.getElementById('swapAmount');
  const swapToken = document.getElementById('swapToken');
  const selectedToken = getSwapTokenConfig(swapToken.value);
  const amount = readPositiveAmount(swapAmount.value);

  if (!connected) {
    connectWallet();
    return;
  }

  if (!hasCircleKitKey()) {
    showToast('Swap temporarily unavailable — try again shortly.', 'error');
    return;
  }

  if (!amount) {
    showToast('Enter an amount to swap.');
    return;
  }

  try {
    await refreshSwapState();
    if (!appState.swapAmountRaw || !appState.swapQuoteRaw) {
      showToast('No swap quote available.');
      return;
    }

    setButtonBusy(button, 'Swap via App Kit');
    showToast(`Confirm ${selectedToken.symbol} to USDC swap in your wallet.`);
    const adapter = await getCircleSwapAdapter();
    const result = await circleAppKit.swap(buildCircleSwapParams(adapter, selectedToken, amount));
    const amountOut = formatCircleAmountOut(result.amountOut);

    addActivity(
      'Swap',
      `+${formatNumber(amountOut, 2)} USDC`,
      `${selectedToken.symbol} to USDC`,
      result.txHash
    );
    await refreshOnchainState();
    await refreshSwapState();
    showToast('Swap confirmed. USDC is ready to deposit.', 'success');
  } catch (error) {
    console.error(error);
    if (error?.code === 4001 || String(error?.message || '').toLowerCase().includes('rejected')) {
      showToast('Transaction rejected.', 'error');
    } else {
      showToast('Swap temporarily unavailable — try again shortly.', 'error');
    }
  } finally {
    clearButtonBusy(button, 'Swap to USDC');
  }
}

function setHealth(nextHealth) {
  appState.health = nextHealth;
  const healthPill = document.getElementById('healthPill');
  const className = nextHealth.toLowerCase().replace(/\s+/g, '-');
  healthPill.className = `health-pill ${className}`;
  healthPill.textContent = nextHealth;
  if (window.gsap && !reduceMotion.matches) {
    window.gsap.from('#healthPill', { scale: 0.88, duration: 0.3, ease: 'back.out(2)' });
  }
}

function setupVaultActions() {
  const depositInput = document.getElementById('depositAmount');
  const withdrawInput = document.getElementById('withdrawAmount');
  const depositAction = document.getElementById('depositAction');
  const withdrawAction = document.getElementById('withdrawAction');
  const depositMax = document.getElementById('depositMax');
  const withdrawMax = document.getElementById('withdrawMax');
  const compoundAction = document.getElementById('compoundAction');
  const withdrawConfirm = document.getElementById('withdrawConfirm');
  const cancelWithdraw = document.getElementById('cancelWithdraw');
  const confirmWithdraw = document.getElementById('confirmWithdraw');
  const withdrawActions = withdrawAction.closest('.form-actions');

  depositInput.addEventListener('input', renderAppState);
  withdrawInput.addEventListener('input', renderAppState);
  depositMax.addEventListener('click', () => {
    depositInput.value = appState.walletUsdc.toFixed(2);
    renderAppState();
  });

  depositAction.addEventListener('click', async () => {
    const amount = readPositiveAmount(depositInput.value);
    if (!connected) {
      connectWallet();
      return;
    }
    if (!amount || amount > appState.walletUsdc) {
      showToast('Enter an amount within your wallet balance.');
      return;
    }

    await runDeposit(amount, depositAction);
  });

  withdrawAction.addEventListener('click', () => {
    const shares = readPositiveAmount(withdrawInput.value);
    if (!connected) {
      showToast('Connect wallet before withdrawing.');
      return;
    }
    if (!appState.contractDeployed) {
      showToast('Contract not yet deployed.');
      return;
    }
    if (!shares || shares > appState.userShares) {
      showToast('Enter shares within your yUSDC balance.');
      return;
    }

    showWithdrawConfirm(shares);
  });

  cancelWithdraw.addEventListener('click', () => {
    hideWithdrawConfirm();
  });

  confirmWithdraw.addEventListener('click', async () => {
    const shares = readPositiveAmount(withdrawInput.value);
    if (!shares || shares > appState.userShares) {
      hideWithdrawConfirm();
      showToast('Enter shares within your yUSDC balance.');
      return;
    }

    await runWithdraw(shares, confirmWithdraw, () => hideWithdrawConfirm(true));
  });

  withdrawMax.addEventListener('click', async () => {
    if (!connected || !appState.address) {
      showToast('Connect wallet before setting max withdrawal.');
      return;
    }

    try {
      setButtonBusy(withdrawMax, '...');
      const { yusdc } = getReadContracts();
      const shares = await yusdc.balanceOf(appState.address);
      const formattedShares = window.ethers.formatUnits(shares, TOKEN_DECIMALS);
      withdrawInput.value = trimTokenAmount(formattedShares, 6);
      appState.userShares = Number(formattedShares);
      renderAppState();
    } catch (error) {
      console.error(error);
      showToast('Could not read yUSDC balance.');
    } finally {
      clearButtonBusy(withdrawMax, 'MAX');
    }
  });

  compoundAction.addEventListener('click', async () => {
    await runCompound(compoundAction);
  });

  function showWithdrawConfirm(shares) {
    const usdcOut = shares * appState.exchangeRate;
    document.getElementById('confirmBurn').textContent = `${formatNumber(shares, 2)} yUSDC`;
    document.getElementById('confirmReceive').textContent = `${formatNumber(usdcOut, 2)} USDC`;
    withdrawActions.style.display = 'none';
    withdrawConfirm.classList.remove('exiting');
    withdrawConfirm.classList.add('visible');
  }

  function hideWithdrawConfirm(immediate = false) {
    if (!withdrawConfirm.classList.contains('visible') && !withdrawConfirm.classList.contains('exiting')) {
      withdrawActions.style.display = '';
      return;
    }

    if (immediate || reduceMotion.matches) {
      withdrawConfirm.classList.remove('visible', 'exiting');
      withdrawActions.style.display = '';
      return;
    }

    withdrawConfirm.classList.remove('visible');
    withdrawConfirm.classList.add('exiting');
    window.setTimeout(() => {
      withdrawConfirm.classList.remove('exiting');
      withdrawActions.style.display = '';
    }, 220);
  }
}

async function runDeposit(amount, button) {
  const parsedAmount = window.ethers.parseUnits(String(amount), TOKEN_DECIMALS);
  setHealth('Supplying');
  setButtonBusy(button, 'Checking allowance…');

  try {
    const { usdc, vault } = await getWriteContracts();
    const allowance = await usdc.allowance(appState.address, ARCVAULT_ADDRESS);

    if (allowance < parsedAmount) {
      setButtonBusy(button, 'Step 1/2 — Approve USDC');
      showToast('Approve USDC spending in your wallet. This is required once.');
      const approveTx = await usdc.approve(ARCVAULT_ADDRESS, parsedAmount);
      await approveTx.wait();
      setButtonBusy(button, 'Step 2/2 — Depositing');
      showToast('Approval confirmed. Submitting deposit...');
    } else {
      setButtonBusy(button, 'Depositing');
    }

    const tx = await vault.deposit(parsedAmount);
    showToast('Deposit submitted. Waiting for Arc confirmation.');
    await tx.wait();

    saveDepositBasis(appState.address, amount);
    addActivity('Deposit', `+${formatNumber(amount, 2)} USDC`, 'minted yUSDC', tx.hash);
    await refreshOnchainState();
    updateApprovalHint(false);
    document.getElementById('depositAmount').value = Math.min(250, appState.walletUsdc).toFixed(2);
    setHealth('Withdraw Ready');
    showToast('Deposit confirmed. yUSDC minted.', 'success');
  } catch (error) {
    console.error(error);
    setHealth('Withdraw Ready');
    handleTxError(error, 'Deposit failed.');
  } finally {
    clearButtonBusy(button, connected ? 'Deposit' : 'Connect Wallet to Deposit');
  }
}

async function runWithdraw(shares, button, onConfirmed) {
  const parsedShares = window.ethers.parseUnits(String(shares), TOKEN_DECIMALS);
  setHealth('Withdraw Ready');
  setButtonBusy(button, 'Withdrawing');

  try {
    const { vault, yusdc } = await getWriteContracts();
    const tx = await vault.withdraw(parsedShares);
    showToast('Withdrawal submitted. Waiting for Arc confirmation.');
    await tx.wait();
    const remainingShares = await yusdc.balanceOf(appState.address);

    if (remainingShares === 0n) {
      clearDepositBasis(appState.address);
    } else {
      const remainingSharesNumber = Number(window.ethers.formatUnits(remainingShares, TOKEN_DECIMALS));
      const shareFraction = shares / (shares + remainingSharesNumber);
      const currentBasis = loadDepositBasis(appState.address);
      const basisReduction = currentBasis * shareFraction;
      clearDepositBasis(appState.address);
      saveDepositBasis(appState.address, currentBasis - basisReduction);
    }

    addActivity('Withdraw', `-${formatNumber(shares, 2)} yUSDC`, 'burned yUSDC', tx.hash);
    if (onConfirmed) onConfirmed();
    await refreshOnchainState();
    document.getElementById('withdrawAmount').value = Math.min(120, appState.userShares).toFixed(2);
    showToast('Withdraw confirmed. USDC returned.', 'success');
  } catch (error) {
    console.error(error);
    handleTxError(error, 'Withdraw failed.');
  } finally {
    clearButtonBusy(button, 'Confirm');
  }
}

async function runCompound(button) {
  if (!appState.isKeeper) return;

  setHealth('Compounding');
  setButtonBusy(button, 'Compounding');

  try {
    const { vault } = await getWriteContracts();
    const tx = await vault.compound();
    showToast('Compound submitted. Waiting for Arc confirmation.');
    await tx.wait();

    addActivity('Compound', 'Yield reinvested', 'keeper executed', tx.hash);
    appState.lastCompoundTimestamp = Date.now();
    await refreshOnchainState();
    setHealth('Withdraw Ready');
    showToast('Compound confirmed.', 'success');
  } catch (error) {
    console.error(error);
    setHealth('Withdraw Ready');
    handleTxError(error, 'Compound failed.');
  } finally {
    clearButtonBusy(button, 'Compound');
  }
}

function setButtonBusy(button, label) {
  button.disabled = true;
  button.classList.add('is-busy');
  button.textContent = label;
}

function clearButtonBusy(button, label) {
  button.disabled = false;
  button.classList.remove('is-busy');
  button.textContent = label;
}

function handleTxError(error, fallback) {
  if (error?.code === 4001 || String(error?.message || '').toLowerCase().includes('rejected')) {
    showToast('Transaction rejected.', 'error');
    return;
  }

  const reason = error?.shortMessage || error?.reason || error?.message || '';
  showToast(reason ? `${fallback} ${reason}` : fallback, 'error');
}

function renderAppState() {
  const depositInput = document.getElementById('depositAmount');
  const withdrawInput = document.getElementById('withdrawAmount');
  const depositAction = document.getElementById('depositAction');
  const depositMax = document.getElementById('depositMax');
  const withdrawAction = document.getElementById('withdrawAction');
  const withdrawMax = document.getElementById('withdrawMax');
  const compoundAction = document.getElementById('compoundAction');
  const depositAmount = readPositiveAmount(depositInput.value) || 0;
  const withdrawShares = readPositiveAmount(withdrawInput.value) || 0;
  const estimatedShares = depositAmount / appState.exchangeRate;
  const estimatedWithdraw = withdrawShares * appState.exchangeRate;
  const earnedPct = appState.depositedUsdc > 0 && appState.dayEarned !== null ? (appState.dayEarned / appState.depositedUsdc) * 100 : 0;
  const displayedApy = appState.netApy !== null ? Math.min(appState.netApy, 999.99) : null;
  const lastYieldUpdate = appState.lastCompoundTimestamp || appState.lastStrategyUpdateTimestamp;

  syncAmountFieldStates();
  depositInput.disabled = !connected;
  withdrawInput.disabled = !connected;
  depositAction.textContent = connected ? 'Deposit' : 'Connect Wallet to Deposit';
  depositMax.hidden = !connected;
  withdrawAction.disabled = !connected;
  withdrawMax.disabled = !connected;
  compoundAction.hidden = !appState.isKeeper;

  document.getElementById('walletAddress').textContent = appState.address ? truncateAddress(appState.address) : '--';
  document.getElementById('walletBalance').textContent = `${formatNumber(appState.walletUsdc, 2)} USDC · ${formatNumber(appState.userShares, 4)} yUSDC`;
  document.getElementById('positionAddress').textContent = appState.address ? truncateAddress(appState.address) : '--';
  document.getElementById('depositWalletBalance').textContent = `${formatNumber(appState.walletUsdc, 2)} USDC`;
  document.getElementById('estimatedShares').textContent = depositAmount > 0 ? `${formatNumber(estimatedShares, 4)} yUSDC` : '--';
  document.getElementById('userShares').textContent = `${formatNumber(appState.userShares, 4)} yUSDC`;
  document.getElementById('withdrawableBalance').textContent = `${formatNumber(estimatedWithdraw || appState.withdrawableUsdc, 2)} USDC`;
  document.getElementById('strategyState').textContent = appState.strategy;
  document.getElementById('vaultMetric').textContent = `${formatNumber(appState.vaultUsdc, 2)}`;
  document.getElementById('apyMetric').textContent = appState.contractDeployed && displayedApy !== null
    ? `${appState.apyIsProjected ? '~' : ''}${formatNumber(displayedApy, 2)}%`
    : '--';
  document.getElementById('apyContext').textContent = appState.netApy === null
    ? '--'
    : lastYieldUpdate
      ? `Last updated ${formatAge(lastYieldUpdate)}`
      : 'Live vault rate';
  document.getElementById('apyContext').title = appState.apyIsProjected ? 'Projected from current vault data' : 'Based on the latest keeper update';
  document.getElementById('earnedMetric').textContent = appState.dayEarned !== null ? `+${formatNumber(appState.dayEarned, 2)}` : '--';
  document.getElementById('earnedContext').textContent = appState.dayEarned !== null ? `≈ $${formatNumber(appState.dayEarned, 2)} · ${formatNumber(earnedPct, 4)}% of position` : '--';
  document.getElementById('exchangeRate').textContent = `1 yUSDC = ${formatNumber(appState.exchangeRate, 4)} USDC`;
  document.getElementById('myDeposited').textContent = `${formatNumber(appState.depositedUsdc, 2)} USDC`;
  document.getElementById('myWithdrawable').textContent = `${formatNumber(appState.withdrawableUsdc, 2)} USDC`;
  document.getElementById('myEarned').textContent = `+${formatNumber(appState.personalEarned, 2)} USDC`;
  renderSwapState();
  renderKeeperTracker();
}

function syncAmountFieldStates() {
  document.querySelectorAll('.amount-field input').forEach((input) => {
    input.closest('.amount-field')?.classList.toggle('has-value', readPositiveAmount(input.value) > 0);
  });
}

function simulateTx(button, label, onComplete) {
  const original = button.textContent;
  button.disabled = true;
  button.classList.add('is-busy');
  button.textContent = label;

  window.setTimeout(() => {
    onComplete();
    button.disabled = false;
    button.classList.remove('is-busy');
    button.textContent = original;
  }, reduceMotion.matches ? 150 : 850);
}

function addActivity(kind, amount, detail, txHash, options = {}) {
  const timeline = document.getElementById('timeline');
  const hash = txHash || makeHash();
  const isNew = options.isNew !== false;
  const row = document.createElement('div');
  row.className = `tx-row${isNew ? ' is-new' : ''}`;
  row.innerHTML = `
    <span class="tx-kind">${kind}</span>
    <span class="tx-hash"><a class="hash-link" href="https://testnet.arcscan.app/tx/${hash}" target="_blank" rel="noopener noreferrer">${truncateHash(hash)}<span class="external-icon">↗</span></a> · ${detail}</span>
    <span class="tx-amount">${amount}</span>
  `;
  if (options.placement === 'append') {
    timeline.append(row);
  } else {
    timeline.prepend(row);
  }

  if (isNew) {
    if (window.gsap && !reduceMotion.matches) {
      row.style.animation = 'none';
      window.gsap.from(row, { x: -16, opacity: 0, duration: 0.4, ease: 'power2.out' });
    }

    window.setTimeout(() => {
      row.classList.remove('is-new');
    }, reduceMotion.matches ? 150 : 900);
  }
}

function showToast(message, variant = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('success', 'error');
  if (variant === 'success' || variant === 'error') {
    toast.classList.add(variant);
  }
  toast.classList.add('visible');
  if (window.gsap && !reduceMotion.matches) {
    window.gsap.fromTo('#toast', { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
  } else {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (window.gsap && !reduceMotion.matches) {
      window.gsap.to('#toast', {
        opacity: 0,
        y: 8,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: () => toast.classList.remove('visible')
      });
    } else {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.classList.remove('visible');
    }
  }, 2400);
}

function readPositiveAmount(value) {
  const number = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatNumber(value, decimals) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function truncateAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function truncateHash(hash) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function trimTokenAmount(value, maxDecimals) {
  const [whole, fraction = ''] = String(value).split('.');
  const trimmedFraction = fraction.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function makeHash() {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let index = 0; index < 64; index += 1) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function getNextKeeperRunTimestamp(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const nextRun = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    KEEPER_RUN_HOUR_UTC,
    0,
    0
  ));

  if (nowMs >= nextRun.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun.getTime();
}

function formatCountdown(ms) {
  const remaining = Math.max(0, ms);
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function formatAge(timestamp) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(elapsed / 3600000);
  const days = Math.floor(elapsed / 86400000);

  if (minutes < 1) return 'just now';
  if (hours < 1) return `${minutes}m ago`;
  if (days < 1) return `${hours}h ago`;
  return `${days}d ago`;
}

function renderKeeperTracker() {
  const lastRebalance = document.getElementById('lastRebalance');
  const nextCompound = document.getElementById('nextCompound');
  const strategySummary = document.getElementById('strategySummary');
  const strategyUpdate = document.getElementById('strategyUpdate');
  if (!lastRebalance || !nextCompound) return;

  const lastTimestamp = appState.lastCompoundTimestamp || appState.lastStrategyUpdateTimestamp;
  const hasCompoundHistory = Boolean(appState.lastCompoundTimestamp) || appState.strategyHarvestCount > 0;
  const pendingYieldText = appState.pendingYieldUsdc === null
    ? 'Checking strategy yield'
    : `Pending yield ${formatNumber(appState.pendingYieldUsdc, 6)} USDC`;

  if (strategySummary) {
    strategySummary.textContent = '100% allocated to yield';
  }

  if (strategyUpdate) {
    strategyUpdate.textContent = hasCompoundHistory && lastTimestamp
      ? `Last updated ${formatAge(lastTimestamp)}`
      : 'No yield update yet';
  }

  lastRebalance.innerHTML = hasCompoundHistory && lastTimestamp
    ? `
      <strong>${formatAge(lastTimestamp)}</strong>
      <small>${appState.lastCompoundTimestamp ? 'Last yield update' : 'Last strategy update'}</small>
    `
    : `
      <strong>No compounds yet</strong>
      <small>Keeper runs daily at ${String(KEEPER_RUN_HOUR_UTC).padStart(2, '0')}:00 UTC</small>
    `;

  nextCompound.innerHTML = `
    <strong>Next run in ${formatCountdown(getNextKeeperRunTimestamp() - Date.now())}</strong>
    <small>${pendingYieldText}</small>
  `;
}

function setupKeeperClock() {
  renderKeeperTracker();
  window.setInterval(renderKeeperTracker, 1000);
}

function setupCounters() {
  const counters = document.querySelectorAll('[data-count]');

  if (reduceMotion.matches) {
    counters.forEach((counter) => {
      const value = Number(counter.dataset.count);
      counter.textContent = formatCounter(value, counter);
    });
    return;
  }

  const animateCounter = (counter) => {
    const target = Number(counter.dataset.count);
    const startTime = performance.now();
    const duration = 1200;

    function tick(now) {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      counter.textContent = formatCounter(target * eased, counter);

      if (elapsed < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });

  counters.forEach((counter) => observer.observe(counter));
}

function formatCounter(value, element) {
  const prefix = element.dataset.prefix || '';
  const suffix = element.dataset.suffix || '';
  const decimals = Math.abs(Number(element.dataset.count)) < 10 ? 2 : 0;
  return `${prefix}${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}${suffix}`;
}

window.addEventListener('resize', sizeCanvas);
sizeCanvas();

if (!reduceMotion.matches) {
  frameId = requestAnimationFrame(renderStars);
} else {
  renderStars(0);
  cancelAnimationFrame(frameId);
}

setupReveal();
setupGsapAnimations();
setupTabs();
setupWallet();
setupSwapActions();
setupVaultActions();
setupKeeperClock();
setupCounters();
renderAppState();
refreshOnchainState().then(() => {
  loadEventHistory();
});

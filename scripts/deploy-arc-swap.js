import { Contract, ContractFactory, JsonRpcProvider, Wallet, formatUnits, parseUnits } from 'ethers';
import { compileArcSwap } from './compile-strategy.js';

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const ARCSWAP_ABI = [
  'function addLiquidity(address token, uint256 tokenAmount, uint256 usdcAmount)',
  'function getReserves(address token) view returns (uint256 tokenReserve, uint256 usdcReserve)'
];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value.trim();
}

async function readToken(token, wallet) {
  const contract = new Contract(token.address, ERC20_ABI, wallet);
  const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol().catch(() => token.symbol)]);
  return {
    ...token,
    contract,
    decimals: Number(decimals),
    symbol
  };
}

async function approveIfNeeded(token, ownerAddress, spender, amount) {
  const allowance = await token.contract.allowance(ownerAddress, spender);
  if (allowance >= amount) {
    log(`${token.symbol} allowance already sufficient.`);
    return;
  }

  log(`Approving ${formatUnits(amount, token.decimals)} ${token.symbol}.`);
  const tx = await token.contract.approve(spender, amount);
  log(`${token.symbol} approve tx: ${tx.hash}`);
  await tx.wait();
}

async function assertBalance(token, ownerAddress, amount) {
  const balance = await token.contract.balanceOf(ownerAddress);
  if (balance < amount) {
    throw new Error(
      `Insufficient ${token.symbol}. Required ${formatUnits(amount, token.decimals)}, ` +
        `wallet has ${formatUnits(balance, token.decimals)}. Fund the owner wallet with real Arc Testnet ${token.symbol}.`
    );
  }
}

async function seedPool(swapper, ownerAddress, token, usdc, tokenAmount, usdcAmount) {
  await assertBalance(token, ownerAddress, tokenAmount);
  await assertBalance(usdc, ownerAddress, usdcAmount);
  await approveIfNeeded(token, ownerAddress, swapper.target, tokenAmount);
  await approveIfNeeded(usdc, ownerAddress, swapper.target, usdcAmount);

  log(`Seeding ${token.symbol}/USDC with ${formatUnits(tokenAmount, token.decimals)} ${token.symbol} and ${formatUnits(usdcAmount, usdc.decimals)} USDC.`);
  const tx = await swapper.addLiquidity(token.address, tokenAmount, usdcAmount);
  log(`${token.symbol}/USDC seed tx: ${tx.hash}`);
  await tx.wait();

  const [tokenReserve, usdcReserve] = await swapper.getReserves(token.address);
  log(
    `${token.symbol}/USDC reserves: ${formatUnits(tokenReserve, token.decimals)} ${token.symbol}, ` +
      `${formatUnits(usdcReserve, usdc.decimals)} USDC`
  );
}

async function main() {
  requireEnv('EURC_LIQUIDITY');
  requireEnv('CIRBTC_LIQUIDITY');
  requireEnv('USDC_FOR_EURC_POOL');
  requireEnv('USDC_FOR_CIRBTC_POOL');

  if (!OWNER_PRIVATE_KEY) {
    throw new Error('Missing OWNER_PRIVATE_KEY env var.');
  }

  log(`Connecting to Arc Testnet RPC: ${ARC_RPC}`);
  const provider = new JsonRpcProvider(ARC_RPC);
  const wallet = new Wallet(OWNER_PRIVATE_KEY, provider);
  const ownerAddress = await wallet.getAddress();
  log(`Deploying from owner wallet: ${ownerAddress}`);

  const [usdc, eurc, cirbtc] = await Promise.all([
    readToken({ address: USDC_ADDRESS, symbol: 'USDC' }, wallet),
    readToken({ address: EURC_ADDRESS, symbol: 'EURC' }, wallet),
    readToken({ address: CIRBTC_ADDRESS, symbol: 'cirBTC' }, wallet)
  ]);

  const eurcAmount = parseUnits(process.env.EURC_LIQUIDITY, eurc.decimals);
  const cirbtcAmount = parseUnits(process.env.CIRBTC_LIQUIDITY, cirbtc.decimals);
  const usdcForEurc = parseUnits(process.env.USDC_FOR_EURC_POOL, usdc.decimals);
  const usdcForCirbtc = parseUnits(process.env.USDC_FOR_CIRBTC_POOL, usdc.decimals);

  await Promise.all([
    assertBalance(eurc, ownerAddress, eurcAmount),
    assertBalance(cirbtc, ownerAddress, cirbtcAmount),
    assertBalance(usdc, ownerAddress, usdcForEurc + usdcForCirbtc)
  ]);

  const artifact = compileArcSwap();
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);

  log('Deploying ArcSwap.');
  const swapper = await factory.deploy(USDC_ADDRESS, [EURC_ADDRESS, CIRBTC_ADDRESS], ownerAddress);
  log(`ArcSwap deploy tx: ${swapper.deploymentTransaction().hash}`);
  await swapper.waitForDeployment();
  log(`ArcSwap deployed: ${swapper.target}`);

  const swapperWithAbi = new Contract(swapper.target, ARCSWAP_ABI, wallet);
  await seedPool(swapperWithAbi, ownerAddress, eurc, usdc, eurcAmount, usdcForEurc);
  await seedPool(swapperWithAbi, ownerAddress, cirbtc, usdc, cirbtcAmount, usdcForCirbtc);

  log(`ARCSWAP_ADDRESS=${swapper.target}`);
  log('Update ARCSWAP_ADDRESS in index.html before enabling live frontend swaps.');
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] ArcSwap deployment failed:`, error);
  process.exit(1);
});

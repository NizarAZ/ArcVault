import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  getAddress,
  parseUnits,
  ZeroAddress
} from 'ethers';

import { compileArcVaultStack } from './compile-strategy.js';

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;
const KEEPER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const STRATEGY_ADDRESS = process.env.NEW_STRATEGY_ADDRESS;
const YIELD_RESERVE_USDC = process.env.YIELD_RESERVE_USDC || '10';
const INITIAL_DEPOSIT_USDC = process.env.INITIAL_DEPOSIT_USDC || '10';

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const TOKEN_DECIMALS = 6;

const STRATEGY_ABI = [
  'function owner() view returns (address)',
  'function vault() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function availableYieldReserve() view returns (uint256)',
  'function setVault(address vault_)',
  'function fundYieldReserve(uint256 assets)'
];
const USDC_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function waitFor(label, transactionPromise) {
  const transaction = await transactionPromise;
  log(`${label} submitted: ${transaction.hash}`);
  const receipt = await transaction.wait();
  log(`${label} confirmed in block ${receipt.blockNumber}.`);
  return receipt;
}

async function main() {
  if (!OWNER_PRIVATE_KEY) throw new Error('OWNER_PRIVATE_KEY is required.');
  if (!KEEPER_PRIVATE_KEY) throw new Error('PRIVATE_KEY is required for the keeper address.');
  if (!STRATEGY_ADDRESS) throw new Error('NEW_STRATEGY_ADDRESS is required.');

  const provider = new JsonRpcProvider(ARC_RPC);
  const owner = new Wallet(OWNER_PRIVATE_KEY, provider);
  const keeper = new Wallet(KEEPER_PRIVATE_KEY);
  const strategyAddress = getAddress(STRATEGY_ADDRESS);
  const strategy = new Contract(strategyAddress, STRATEGY_ABI, owner);
  const usdc = new Contract(USDC_ADDRESS, USDC_ABI, owner);

  const [strategyOwner, strategyAssets] = await Promise.all([
    strategy.owner(),
    strategy.totalAssets()
  ]);

  if (getAddress(strategyOwner) !== getAddress(owner.address)) {
    throw new Error(`Strategy owner is ${strategyOwner}, not ${owner.address}.`);
  }
  if (strategyAssets !== 0n) {
    throw new Error(`Strategy already accounts for ${formatUnits(strategyAssets, TOKEN_DECIMALS)} USDC.`);
  }

  const reserve = parseUnits(YIELD_RESERVE_USDC, TOKEN_DECIMALS);
  const initialDeposit = parseUnits(INITIAL_DEPOSIT_USDC, TOKEN_DECIMALS);
  const requiredUsdc = reserve + initialDeposit;
  const ownerBalance = await usdc.balanceOf(owner.address);
  if (ownerBalance < requiredUsdc) {
    throw new Error(
      `Owner needs ${formatUnits(requiredUsdc, TOKEN_DECIMALS)} USDC; balance is ` +
      `${formatUnits(ownerBalance, TOKEN_DECIMALS)} USDC.`
    );
  }

  log(`Owner: ${owner.address}`);
  log(`Keeper: ${keeper.address}`);
  log(`Realistic strategy: ${strategyAddress}`);
  log('Compiling ArcVault and yUSDC.');
  const { ArcVault, yUSDC } = compileArcVaultStack();

  const receiptFactory = new ContractFactory(yUSDC.abi, yUSDC.bytecode, owner);
  const receiptToken = await receiptFactory.deploy(owner.address, TOKEN_DECIMALS);
  log(`yUSDC deployment submitted: ${receiptToken.deploymentTransaction().hash}`);
  await receiptToken.waitForDeployment();
  const receiptAddress = await receiptToken.getAddress();
  log(`yUSDC deployed: ${receiptAddress}`);

  const vaultFactory = new ContractFactory(ArcVault.abi, ArcVault.bytecode, owner);
  const vault = await vaultFactory.deploy(
    USDC_ADDRESS,
    receiptAddress,
    keeper.address,
    ZeroAddress,
    owner.address
  );
  log(`ArcVault deployment submitted: ${vault.deploymentTransaction().hash}`);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  log(`ArcVault deployed: ${vaultAddress}`);

  await waitFor('Link yUSDC to ArcVault', receiptToken.setVault(vaultAddress));
  await waitFor('Link realistic strategy to ArcVault', strategy.setVault(vaultAddress));
  await waitFor('Set ArcVault strategy', vault.setStrategy(strategyAddress));

  if (reserve > 0n) {
    await waitFor('Approve strategy reserve', usdc.approve(strategyAddress, reserve));
    await waitFor('Fund strategy reserve', strategy.fundYieldReserve(reserve));
  }

  if (initialDeposit > 0n) {
    await waitFor('Approve initial vault deposit', usdc.approve(vaultAddress, initialDeposit));
    await waitFor('Seed initial vault deposit', vault.deposit(initialDeposit));
  }

  const [activeStrategy, activeKeeper, vaultAssets, strategyReserve] = await Promise.all([
    vault.strategy(),
    vault.keeper(),
    vault.totalAssets(),
    strategy.availableYieldReserve()
  ]);

  if (getAddress(activeStrategy) !== strategyAddress) throw new Error('Vault strategy verification failed.');
  if (getAddress(activeKeeper) !== getAddress(keeper.address)) throw new Error('Vault keeper verification failed.');

  log('Replacement deployment complete.');
  log(`ARCVAULT_ADDRESS=${vaultAddress}`);
  log(`YUSDC_ADDRESS=${receiptAddress}`);
  log(`STRATEGY_ADDRESS=${strategyAddress}`);
  log(`Vault assets: ${formatUnits(vaultAssets, TOKEN_DECIMALS)} USDC`);
  log(`Yield reserve: ${formatUnits(strategyReserve, TOKEN_DECIMALS)} USDC`);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] Replacement deployment failed:`, error);
  process.exit(1);
});

import { Contract, Interface, JsonRpcProvider, Wallet, formatUnits } from 'ethers';

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ARCVAULT_ADDRESS = '0xb9FA72d5BBD6417F94E692D578546DB72Fb3042e';
const STRATEGY_ADDRESS = '0x1Fdf6E91fdB0091017B4126f80431C41b94a66B3';
const TOKEN_DECIMALS = 6;

const ARCVAULT_ABI = [
  'function compound() returns (uint256)',
  'function keeper() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'event Compounded(address indexed keeper, uint256 yieldAssets, uint256 totalAssetsAfter)'
];
const STRATEGY_ABI = ['function totalAssets() view returns (uint256)'];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function formatUsdc(value) {
  return `${formatUnits(value, TOKEN_DECIMALS)} USDC`;
}

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is required.');
  }

  log(`Connecting to Arc Testnet RPC: ${ARC_RPC}`);
  const provider = new JsonRpcProvider(ARC_RPC);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  log(`Loaded keeper wallet: ${wallet.address}`);

  const vault = new Contract(ARCVAULT_ADDRESS, ARCVAULT_ABI, wallet);
  const strategy = new Contract(STRATEGY_ADDRESS, STRATEGY_ABI, provider);

  log('Reading vault keeper address.');
  const keeper = await vault.keeper();
  if (keeper.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Wallet is not the vault keeper. Expected ${keeper}, got ${wallet.address}.`);
  }
  log('Keeper address verified.');

  log('Reading strategy assets.');
  const strategyAssets = await strategy.totalAssets();
  log(`Strategy assets: ${formatUsdc(strategyAssets)}`);

  log('Reading pre-compound vault totalAssets.');
  const totalAssetsBefore = await vault.totalAssets();
  log(`Vault totalAssets before compound: ${formatUsdc(totalAssetsBefore)}`);

  if (strategyAssets <= 0n) {
    log('Strategy has no assets. Skipping compound to avoid wasting gas.');
    return;
  }

  log('Submitting vault.compound().');
  const tx = await vault.compound();
  log(`Compound submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  log(`Compound confirmed in block ${receipt.blockNumber}.`);

  const vaultInterface = new Interface(ARCVAULT_ABI);
  const compoundedEvent = receipt.logs
    .map((eventLog) => {
      try {
        return vaultInterface.parseLog(eventLog);
      } catch {
        return null;
      }
    })
    .find((eventLog) => eventLog?.name === 'Compounded');

  if (!compoundedEvent) {
    throw new Error('Compound confirmed but Compounded event was not found.');
  }

  const yieldAssets = compoundedEvent.args.yieldAssets;
  const totalAssetsAfter = compoundedEvent.args.totalAssetsAfter;
  log(`Yield harvested: ${formatUsdc(yieldAssets)}`);
  log(`Vault totalAssets after compound: ${formatUsdc(totalAssetsAfter)}`);
}

main()
  .then(() => {
    log('Keeper cycle complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[${new Date().toISOString()}] Keeper cycle failed:`, error);
    process.exit(1);
  });

import { Contract, Interface, JsonRpcProvider, Wallet, formatUnits } from 'ethers';

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ARCVAULT_ADDRESS = '0xf6BEB2719018814fa034006Fa1e7Be5a4f08D21c';
const TOKEN_DECIMALS = 6;

const ARCVAULT_ABI = [
  'function compound() returns (uint256)',
  'function keeper() view returns (address)',
  'function strategy() view returns (address)',
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

  log('Reading vault keeper address.');
  const keeper = await vault.keeper();
  if (keeper.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Wallet is not the vault keeper. Expected ${keeper}, got ${wallet.address}.`);
  }
  log('Keeper address verified.');

  const strategyAddress = await vault.strategy();
  log(`Active strategy: ${strategyAddress}`);
  const strategy = new Contract(strategyAddress, STRATEGY_ABI, provider);

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

  log('Simulating vault.compound() before broadcast.');
  try {
    const expectedYield = await vault.compound.staticCall();
    log(`Compound simulation succeeded. Expected yield: ${formatUsdc(expectedYield)}`);
  } catch (error) {
    const reason = error?.shortMessage || error?.reason || error?.message || '';

    if (reason.includes('caller is not a minter')) {
      log(
        `Compound skipped: active strategy ${strategyAddress} is the legacy minting mock. ` +
        'Deploy and assign RealisticMockLendingStrategy before automated compounding.'
      );
      return;
    }

    throw error;
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

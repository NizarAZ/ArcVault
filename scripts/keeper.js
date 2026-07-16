import { Contract, Interface, JsonRpcProvider, Wallet, formatUnits } from 'ethers';

// Arc Testnet's public RPC (rpc.testnet.arc.network) enforces per-IP rate limits.
// GitHub Actions runners can trip these because each eth_call is a separate JSON-RPC
// request in quick succession. These retries distinguish transient RPC throttling
// (-32011) from genuine contract reverts, which should still fail fast.

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

/**
 * Promise-based delay helper.
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry helper for RPC calls that handles Arc Testnet public RPC rate limiting.
 * 
 * @param {Function} fn - The async function to execute
 * @param {Object} options - Configuration options
 * @param {number} options.attempts - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Starting delay in milliseconds (default: 1000)
 * @param {string} options.label - Description of the operation for logging
 * @returns {Promise<any>} - The result of the successful function call
 */
async function retryWithBackoff(fn, { attempts = 3, baseDelayMs = 1000, label } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Check if this is a rate-limit error from Arc Testnet RPC
      const isRateLimitError =
        error?.info?.error?.code === -32011 ||
        error?.shortMessage?.includes('request limit') ||
        error?.message?.includes('request limit');

      // If it's NOT a rate-limit error, or if it has actual revert data (genuine contract error),
      // fail immediately without retrying
      if (!isRateLimitError || error?.data || error?.reason) {
        throw error;
      }

      // Rate-limit error: retry with exponential backoff
      if (attempt < attempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        log(`Rate-limited by RPC (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`);
        await delay(delayMs);
      } else {
        // All retries exhausted
        throw new Error(`RPC rate-limited after ${attempts} attempts, giving up: ${error.message}`);
      }
    }
  }
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
  const keeper = await retryWithBackoff(() => vault.keeper(), { label: 'vault.keeper()' });
  await delay(250); // Small delay to reduce rate limit chance
  if (keeper.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Wallet is not the vault keeper. Expected ${keeper}, got ${wallet.address}.`);
  }
  log('Keeper address verified.');

  const strategyAddress = await retryWithBackoff(() => vault.strategy(), { label: 'vault.strategy()' });
  await delay(250); // Small delay to reduce rate limit chance
  log(`Active strategy: ${strategyAddress}`);
  const strategy = new Contract(strategyAddress, STRATEGY_ABI, provider);

  log('Reading strategy assets.');
  const strategyAssets = await retryWithBackoff(() => strategy.totalAssets(), { label: 'strategy.totalAssets()' });
  await delay(250); // Small delay to reduce rate limit chance
  log(`Strategy assets: ${formatUsdc(strategyAssets)}`);

  log('Reading pre-compound vault totalAssets.');
  const totalAssetsBefore = await retryWithBackoff(() => vault.totalAssets(), { label: 'vault.totalAssets()' });
  await delay(250); // Small delay to reduce rate limit chance
  log(`Vault totalAssets before compound: ${formatUsdc(totalAssetsBefore)}`);

  if (strategyAssets <= 0n) {
    log('Strategy has no assets. Skipping compound to avoid wasting gas.');
    return;
  }

  log('Simulating vault.compound() before broadcast.');
  try {
    const expectedYield = await retryWithBackoff(() => vault.compound.staticCall(), { label: 'vault.compound.staticCall()' });
    log(`Compound simulation succeeded. Expected yield: ${formatUsdc(expectedYield)}`);
  } catch (error) {
    const reason = error?.shortMessage || error?.reason || error?.message || '';

    if (reason.includes('caller is not a minter')) {
      log(
        `Compound skipped: active strategy ${strategyAddress} is the legacy minting mock. ` +
        'Deploy and assign MorphoVaultStrategy before automated compounding.'
      );
      return;
    }

    throw error;
  }

  log('Submitting vault.compound().');
  const tx = await retryWithBackoff(() => vault.compound(), { label: 'vault.compound()' });
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

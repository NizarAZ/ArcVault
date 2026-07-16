import { Contract, Interface, JsonRpcProvider, Wallet, formatUnits } from 'ethers';

// Arc Testnet's public RPC (rpc.testnet.arc.network) enforces per-IP rate limits.
// GitHub Actions runners can trip these because each eth_call is a separate JSON-RPC
// request in quick succession. These retries distinguish transient RPC throttling
// from genuine contract reverts, which should still fail fast.

const ARCRPC = process.env.ARCRPC || 'https://rpc.testnet.arc.network';
const ARCRPC_FALLBACK = process.env.ARCRPC_FALLBACK;
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
 * Sanitize URL to hostname only for logging (never log full URLs with credentials).
 */
function sanitizeUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Promise-based delay helper.
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add jitter to delay to avoid thundering herd problems.
 */
function withJitter(baseDelayMs, jitterFraction = 0.1) {
  const jitterMs = baseDelayMs * jitterFraction * (Math.random() * 2 - 1);
  return Math.max(0, baseDelayMs + jitterMs);
}

/**
 * Check if an error is a transient RPC error that should be retried.
 * This includes:
 * - JSON-RPC code -32011 (request limit reached)
 * - HTTP 429 (rate limit)
 * - HTTP 5xx errors
 * - Timeouts and connection errors
 * - Ethers errors with nested rate-limit information
 * 
 * Does NOT retry:
 * - Genuine Solidity reverts (has data/reason fields)
 * - Invalid environment variables
 * - Invalid addresses
 * - Keeper authorization failures
 */
export function isTransientRpcError(error) {
  if (!error) return false;

  // Check for genuine contract reverts - these should fail fast
  if (error?.data || error?.reason) {
    return false;
  }

  // Check for ethers v6 CALL_EXCEPTION with nested rate-limit error
  const nestedErrorCode = error?.info?.error?.code ?? error?.error?.error?.code ?? error?.cause?.code;
  
  if (nestedErrorCode === -32011) {
    return true;
  }

  // Check for rate-limit messages in various error fields
  const message = error?.message || error?.shortMessage || '';
  if (message.includes('request limit') || message.includes('rate limit') || message.includes('429')) {
    return true;
  }

  // Check for HTTP 5xx errors
  if (error?.code >= 500 && error?.code < 600) {
    return true;
  }

  // Check for timeout/connection errors
  if (message.includes('timeout') || message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
    return true;
  }

  // Check for network errors
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'SERVER_ERROR') {
    return true;
  }

  return false;
}

/**
 * Retry helper with exponential backoff and jitter for transient RPC errors.
 * 
 * @param {Function} fn - The async function to execute
 * @param {Object} options - Configuration options
 * @param {number} options.attempts - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Starting delay in milliseconds (default: 1000)
 * @param {string} options.label - Description of the operation for logging
 * @param {string} options.providerName - Sanitized provider hostname for logging
 * @returns {Promise<any>} - The result of the successful function call
 */
export async function retryWithBackoff(fn, { attempts = 3, baseDelayMs = 1000, label, providerName } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientRpcError(error)) {
        // Not a transient error - fail immediately
        throw error;
      }

      if (attempt < attempts) {
        const delayMs = withJitter(baseDelayMs * Math.pow(2, attempt - 1));
        log(`RPC transient error on ${label} via ${providerName} (attempt ${attempt}/${attempts}), retrying in ${Math.round(delayMs)}ms...`);
        await delay(delayMs);
      } else {
        // All retries exhausted
        throw new Error(`RPC unavailable after ${attempts} attempts via ${providerName} for ${label}: ${error.message}`);
      }
    }
  }
}

/**
 * Execute a read-only function with provider failover.
 * Tries primary provider first, then fallback if configured and primary fails with transient errors.
 * 
 * @param {Function} fn - Function that takes a provider and returns a promise
 * @param {JsonRpcProvider} primaryProvider - Primary RPC provider
 * @param {JsonRpcProvider|null} fallbackProvider - Fallback RPC provider (optional)
 * @param {Object} options - Retry options
 * @param {string} options.providerName - Sanitized provider hostname for logging (required)
 * @param {string} options.fallbackProviderName - Sanitized fallback provider hostname (optional)
 * @returns {Promise<any>} - The result of the successful function call
 */
export async function withProviderFailover(fn, primaryProvider, fallbackProvider, options = {}) {
  const primaryHostname = options.providerName || sanitizeUrl(primaryProvider._connection?.url || 'primary');
  const fallbackHostname = options.fallbackProviderName || (fallbackProvider ? sanitizeUrl(fallbackProvider._connection?.url || 'fallback') : null);

  try {
    return await retryWithBackoff(() => fn(primaryProvider), {
      ...options,
      providerName: primaryHostname
    });
  } catch (primaryError) {
    if (!fallbackProvider) {
      throw primaryError;
    }

    log(`Primary provider ${primaryHostname} failed, trying fallback ${fallbackHostname}...`);
    return await retryWithBackoff(() => fn(fallbackProvider), {
      ...options,
      providerName: fallbackHostname
    });
  }
}

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY key is required.');
  }

  const primaryProvider = new JsonRpcProvider(ARCRPC);
  const fallbackProvider = ARCRPC_FALLBACK ? new JsonRpcProvider(ARCRPC_FALLBACK) : null;

  // Compute explicit provider names for logging
  const primaryRpcName = sanitizeUrl(ARCRPC);
  const fallbackRpcName = ARCRPC_FALLBACK ? sanitizeUrl(ARCRPC_FALLBACK) : null;

  log(`Connecting to Arc Testnet RPC: ${primaryRpcName}${fallbackRpcName ? ` (fallback: ${fallbackRpcName})` : ''}`);
  
  const wallet = new Wallet(PRIVATE_KEY, primaryProvider);
  log(`Loaded keeper wallet: ${wallet.address}`);

  // Create vault contract with signer for keeper-authorized operations
  const vault = new Contract(ARCVAULT_ADDRESS, ARCVAULT_ABI, wallet);

  // Create provider-only vault for read operations
  const providerVault = new Contract(ARCVAULT_ADDRESS, ARCVAULT_ABI, primaryProvider);

  log('Reading vault keeper address.');
  const keeper = await withProviderFailover(
    (provider) => providerVault.connect(provider).keeper(),
    primaryProvider,
    fallbackProvider,
    { label: 'vault.keeper()', providerName: primaryRpcName, fallbackProviderName: fallbackRpcName }
  );
  await delay(250); // Small delay to reduce rate limit chance

  if (keeper.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Wallet is not the vault keeper. Expected ${keeper}, got ${wallet.address}.`);
  }
  log('Keeper address verified.');

  const strategyAddress = await withProviderFailover(
    (provider) => providerVault.connect(provider).strategy(),
    primaryProvider,
    fallbackProvider,
    { label: 'vault.strategy()', providerName: primaryRpcName, fallbackProviderName: fallbackRpcName }
  );
  await delay(250); // Small delay to reduce rate limit chance
  log(`Active strategy: ${strategyAddress}`);

  const strategy = new Contract(strategyAddress, STRATEGY_ABI, primaryProvider);

  log('Reading strategy assets.');
  const strategyAssets = await withProviderFailover(
    (provider) => strategy.connect(provider).totalAssets(),
    primaryProvider,
    fallbackProvider,
    { label: 'strategy.totalAssets()', providerName: primaryRpcName, fallbackProviderName: fallbackRpcName }
  );
  await delay(250); // Small delay to reduce rate limit chance
  log(`Strategy assets: ${formatUsdc(strategyAssets)}`);

  log('Reading pre-compound vault totalAssets.');
  const totalAssetsBefore = await withProviderFailover(
    (provider) => providerVault.connect(provider).totalAssets(),
    primaryProvider,
    fallbackProvider,
    { label: 'vault.totalAssets()', providerName: primaryRpcName, fallbackProviderName: fallbackRpcName }
  );
  await delay(250); // Small delay to reduce rate limit chance
  log(`Vault totalAssets before compound: ${formatUsdc(totalAssetsBefore)}`);

  if (strategyAssets <= 0n) {
    log('Strategy has no assets. Skipping compound to avoid wasting gas.');
    return;
  }

  log('Simulating vault.compound() before broadcast with keeper sender context.');
  try {
    // Use signer-connected vault for staticCall to preserve keeper sender context
    const expectedYield = await retryWithBackoff(() => vault.compound.staticCall(), {
      label: 'vault.compound.staticCall()',
      providerName: primaryRpcName
    });
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

  // Add delay after successful simulation before transaction submission
  await delay(2000);

  log('Verifying network connectivity before transaction submission.');
  await retryWithBackoff(() => primaryProvider.getNetwork(), {
    label: 'getNetwork',
    providerName: primaryRpcName
  });

  log('Submitting vault.compound().');
  // Simple transaction submission through primary provider only (no retry/failover)
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

// Only run main() if this file is executed directly (not imported as a module)
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main()
    .then(() => {
      log('Keeper cycle complete.');
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[${new Date().toISOString()}] Keeper cycle failed:`, error);
      process.exit(1);
    });
}

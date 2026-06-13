import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  getAddress
} from 'ethers';

import { compileRealisticStrategy } from './compile-strategy.js';

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARCVAULT_ADDRESS = process.env.VAULT_ADDRESS;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';

const BASE_APR_BPS = BigInt(process.env.BASE_APR_BPS || '1200');
const UTILIZATION_MODEL_ENABLED = (process.env.UTILIZATION_MODEL_ENABLED || 'true') === 'true';
const UTILIZATION_BPS = BigInt(process.env.UTILIZATION_BPS || '8000');
const UTILIZATION_ADJUSTMENT_BPS = BigInt(process.env.UTILIZATION_ADJUSTMENT_BPS || '500');

const VAULT_ABI = ['function owner() view returns (address)'];

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY is required to deploy the strategy.');
  if (!ARCVAULT_ADDRESS) throw new Error('VAULT_ADDRESS is required to deploy the strategy.');

  const provider = new JsonRpcProvider(ARC_RPC);
  const deployer = new Wallet(PRIVATE_KEY, provider);
  const vault = new Contract(ARCVAULT_ADDRESS, VAULT_ABI, provider);
  const vaultOwner = getAddress(await vault.owner());

  log(`Deploying from ${deployer.address}`);
  log(`Strategy owner will be ArcVault owner ${vaultOwner}`);
  log(
    `APR parameters: base=${BASE_APR_BPS} bps, utilization=${UTILIZATION_BPS} bps, ` +
    `adjustment=${UTILIZATION_ADJUSTMENT_BPS} bps, enabled=${UTILIZATION_MODEL_ENABLED}`
  );

  const { abi, bytecode } = compileRealisticStrategy();
  const factory = new ContractFactory(abi, bytecode, deployer);
  const strategy = await factory.deploy(
    USDC_ADDRESS,
    ARCVAULT_ADDRESS,
    vaultOwner,
    BASE_APR_BPS,
    UTILIZATION_MODEL_ENABLED,
    UTILIZATION_BPS,
    UTILIZATION_ADJUSTMENT_BPS
  );

  log(`Deployment submitted: ${strategy.deploymentTransaction().hash}`);
  await strategy.waitForDeployment();
  log(`RealisticMockLendingStrategy deployed: ${await strategy.getAddress()}`);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] Strategy deployment failed:`, error);
  process.exit(1);
});

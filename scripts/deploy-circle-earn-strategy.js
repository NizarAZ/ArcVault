import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  getAddress
} from 'ethers';

import { compileCircleEarnStrategy } from './compile-strategy.js';

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARCVAULT_ADDRESS = process.env.VAULT_ADDRESS;
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EARNKIT_USDC_VAULT = '0xaabbef1d3971c710276ed41ec791bbe14cdb8e88';

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
  log(`ArcVault owner is ${vaultOwner}`);
  log(`ArcVault: ${ARCVAULT_ADDRESS}`);
  log(`EarnKit USDC Vault: ${EARNKIT_USDC_VAULT}`);

  const { abi, bytecode } = compileCircleEarnStrategy();
  const factory = new ContractFactory(abi, bytecode, deployer);
  const strategy = await factory.deploy(
    USDC_ADDRESS,
    EARNKIT_USDC_VAULT,
    ARCVAULT_ADDRESS,
    vaultOwner
  );

  log(`Deployment submitted: ${strategy.deploymentTransaction().hash}`);
  await strategy.waitForDeployment();
  log(`CircleEarnStrategy deployed: ${await strategy.getAddress()}`);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] Strategy deployment failed:`, error);
  process.exit(1);
});

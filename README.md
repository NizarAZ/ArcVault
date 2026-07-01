# ArcVault

ArcVault is a non-custodial USDC yield vault deployed on Arc Testnet. Users deposit USDC, receive yUSDC receipt tokens, and withdraw their proportional share of the vault.

The project includes a Vite frontend, Solidity vault contracts, Circle App Kit swaps on Arc Testnet, a Morpho VaultV2 strategy adapter, and an automated keeper.

## Live App

[arc-vault-kappa.vercel.app](https://arc-vault-kappa.vercel.app)

## Network

| Setting | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Native symbol | `USDC` |

## Submission Contracts

| Contract | Address |
| --- | --- |
| ArcVault | `0xf6BEB2719018814fa034006Fa1e7Be5a4f08D21c` |
| yUSDC | `0xF9a536cbb52a6AEC3b233883958bB4b6102156bA` |
| MorphoVaultStrategy | `0xD6bE89da890AcC2D2792A74a67a6897fc7758E98` |

External dependency:

- Morpho VaultV2, an Arc ecosystem lending partner vault deployed by a third party on Arc Testnet: `0xaabbef1d3971c710276ed41ec791bbe14cdb8e88`

Token dependencies:

- Arc Testnet USDC: `0x3600000000000000000000000000000000000000`
- Arc Testnet EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- Arc Testnet cirBTC: `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF`

The current ArcVault address remains unchanged and now points to the deployed Morpho vault strategy.

## Circle App Kit Swap

The active swap UI uses Circle App Kit to swap existing Arc Testnet assets into USDC before depositing into ArcVault.

Live pairs:

- `EURC -> USDC`
- `cirBTC -> USDC`

The frontend uses:

- `@circle-fin/app-kit`
- `@circle-fin/adapter-viem-v2`
- connected browser wallet signing
- `Arc_Testnet` as the App Kit chain identifier
- `1%` slippage protection through `slippageBps: 100`

Current UI flow:

1. Choose `EURC` or `cirBTC`.
2. Enter an amount.
3. Review the Circle App Kit quote.
4. Click `Swap to USDC`.
5. Sign the wallet prompts required by App Kit.
6. Deposit the received USDC into ArcVault.

USDC is not shown as a swap input because it can already be deposited directly. The frontend keeps a separate `Use USDC balance in deposit` shortcut for that flow.

[`ArcSwap.sol`](arcvault-contracts/src/ArcSwap.sol) remains in the repo as legacy testnet AMM code, but it is no longer the active frontend swap route.

## Morpho Vault Strategy

[`MorphoVaultStrategy.sol`](arcvault-contracts/src/MorphoVaultStrategy.sol) is ArcVault's onchain adapter for a third-party Morpho VaultV2 on Arc Testnet.

The strategy provides:

- vault-only USDC deposits into the Morpho vault
- vault-only withdrawals back to ArcVault
- tracked Morpho vault shares
- accounted USDC assets for ArcVault share math
- `pendingYield()` for Morpho vault value above internal accounting
- `harvest()` to realize positive Morpho vault value into strategy accounting

Yield comes from the Morpho vault share price. `harvest()` compares the current Morpho vault asset value against internal accounting, updates accounting when the value is higher, and returns the realized yield amount.

## Vault Accounting

ArcVault reports total managed assets as:

```text
vault USDC balance + strategy.totalAssets()
```

During `compound()`:

1. ArcVault reads `totalAssets()` before harvesting.
2. It calls `strategy.harvest()`.
3. It reads `totalAssets()` again.
4. The positive before/after difference becomes `yieldAssets`.
5. ArcVault emits `Compounded(keeper, yieldAssets, totalAssetsAfter)`.

The vault uses state-based accounting rather than trusting the strategy's raw harvest return.

## Deployment

Deploy the Morpho vault strategy:

```powershell
cd arcvault-contracts
$env:VAULT_ADDRESS="0xf6BEB2719018814fa034006Fa1e7Be5a4f08D21c"
forge script script/DeployMorphoVaultStrategy.s.sol --rpc-url arc_testnet --broadcast --private-key $env:PRIVATE_KEY
```

Point the existing ArcVault to the strategy:

```powershell
$env:STRATEGY_ADDRESS="<morpho-vault-strategy-address>"
$env:DEPLOY_IDLE="true"
forge script script/ConfigureStrategy.s.sol --rpc-url arc_testnet --broadcast --private-key $env:PRIVATE_KEY
```

Legacy ArcSwap was deployed with [`scripts/deploy-arc-swap.js`](scripts/deploy-arc-swap.js). The script:

- compiles `ArcSwap.sol`
- deploys ArcSwap with existing Arc Testnet token addresses
- checks the owner wallet's real EURC, cirBTC, and USDC balances
- approves the required token amounts
- seeds both pools
- prints `ARCSWAP_ADDRESS`

Required legacy ArcSwap deployment environment:

```env
OWNER_PRIVATE_KEY=your_owner_wallet_private_key
ARC_RPC=https://rpc.testnet.arc.network
EURC_LIQUIDITY=20
CIRBTC_LIQUIDITY=0.00003
USDC_FOR_EURC_POOL=20
USDC_FOR_CIRBTC_POOL=30
```

Run:

```powershell
cd scripts
npm install
node --env-file=.env deploy-arc-swap.js
```

The script intentionally fails if the owner wallet lacks real Arc Testnet EURC, cirBTC, or USDC. It does not deploy mock tokens. This is kept for reference only while the frontend uses Circle App Kit.

## Frontend

The frontend is a minimal Vite app with [`index.html`](index.html) and [`src/main.js`](src/main.js).

- vanilla HTML, CSS, and JavaScript
- Vite build step
- ethers.js v6 for vault and ERC-20 reads/writes
- GSAP 3 for animations
- Circle App Kit for testnet swaps
- no React
- ERC-20 USDC wallet balance using six decimals
- yUSDC position and withdrawable asset display
- address-specific local deposit cost basis
- recent `Deposited`, `Withdrawn`, and `Compounded` event history
- projected or compound-derived APY
- visible two-step USDC approval and deposit flow
- Circle App Kit dashboard for `EURC -> USDC` and `cirBTC -> USDC`
- App Kit quote, minimum received, and wallet-signed swap flow
- cirBTC quotes routed by Arc token address with retries and same-amount quote caching
- success and error toast indicators for confirmed or failed transactions

Create `.env.local` for local frontend development:

```env
VITE_CIRCLE_KIT_KEY=KIT_KEY:key_id:key_secret
```

Production also needs `VITE_CIRCLE_KIT_KEY` configured in Vercel. The committed [`vercel.json`](vercel.json) rewrites `/api/circle/*` to Circle's API so the App Kit browser requests work in production as well as during local Vite development.

Run locally:

```powershell
npm install
npm run dev
```

## Keeper

The one-shot keeper is in [`scripts/keeper.js`](scripts/keeper.js). It is designed for local execution, cron, and GitHub Actions.

The keeper:

1. Loads `PRIVATE_KEY` and `ARC_RPC`.
2. Verifies its wallet matches `vault.keeper()`.
3. Reads strategy and vault assets.
4. Skips compounding when the strategy is empty.
5. Calls `vault.compound()`.
6. Simulates `compound()` before broadcasting.
7. Parses the `Compounded` event.
8. Logs the transaction hash, harvested yield, and new total assets.

Local setup:

```powershell
cd scripts
npm install
```

Create `scripts/.env`:

```env
PRIVATE_KEY=your_keeper_wallet_private_key
ARC_RPC=https://rpc.testnet.arc.network
```

Run:

```powershell
node --env-file=.env keeper.js
```

Never commit `.env` or expose a private key.

## Automated Compounding

The workflow at [`.github/workflows/keeper.yml`](.github/workflows/keeper.yml) runs:

- daily at `18:00 UTC`
- manually through `workflow_dispatch`

Add this GitHub Actions repository secret:

```text
KEEPER_PRIVATE_KEY
```

It must belong to the wallet currently returned by `ArcVault.keeper()`. Once configured, compounding runs from GitHub Actions and does not require a local machine to remain online.

## Testing the App

1. Add Arc Testnet to MetaMask.
2. Get testnet USDC from [Circle Faucet](https://faucet.circle.com/).
3. Open the live app.
4. Connect your wallet.
5. Deposit USDC directly, or swap EURC/cirBTC into USDC first through Circle App Kit.
6. Approve USDC on the first deposit.
7. Confirm the deposit transaction.
8. Withdraw by entering the amount of yUSDC shares to burn.

## Contract Tests

Foundry tests cover the vault, Morpho vault strategy accounting, and legacy ArcSwap behavior.

Run:

```powershell
cd arcvault-contracts
forge test
```

Current local result:

```text
21 tests passed, 0 failed, 0 skipped
```

## Project Structure

```text
index.html
vercel.json
src/
  main.js
scripts/
  deploy-arc-swap.js
  keeper.js
arcvault-contracts/
  src/
    ArcSwap.sol
    ArcVault.sol
    yUSDC.sol
    MorphoVaultStrategy.sol
  script/
  test/
    ArcSwap.t.sol
    ArcVault.t.sol
.github/
  workflows/
    keeper.yml
```

## Stack

- Solidity 0.8.24
- Foundry
- OpenZeppelin Contracts
- ethers.js v6
- GSAP 3
- Vite
- Circle App Kit
- viem
- GitHub Actions
- Vercel
- Arc Testnet

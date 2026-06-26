# ArcVault

ArcVault is a non-custodial USDC yield vault deployed on Arc Testnet. Users deposit USDC, receive yUSDC receipt tokens, and withdraw their proportional share of the vault.

The project includes a single-file frontend, Solidity vault contracts, a deterministic mock lending strategy, an owner-seeded ArcSwap AMM, and an automated keeper.

## Live App

[arc-vault-kappa.vercel.app](https://arc-vault-kappa.vercel.app)

## Network

| Setting | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Native symbol | `USDC` |

## Deployed Contracts

| Contract | Address |
| --- | --- |
| ArcVault | `0xf6BEB2719018814fa034006Fa1e7Be5a4f08D21c` |
| yUSDC | `0xF9a536cbb52a6AEC3b233883958bB4b6102156bA` |
| RealisticMockLendingStrategy | `0x6585CBCB1198c1DaDB1315D3437b8A0557818171` |
| ArcSwap | `0xfaF3D6B6600B3D14E781cf0d0408c56E4FE49Af4` |
| Arc Testnet USDC | `0x3600000000000000000000000000000000000000` |
| Arc Testnet EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Arc Testnet cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |

The active ArcVault points to `RealisticMockLendingStrategy`. It was deployed with a separate keeper wallet, a prefunded yield reserve, and an initial testnet deposit.

The previous vault at `0xb9FA72d5BBD6417F94E692D578546DB72Fb3042e` remains available for legacy yUSDC holders to withdraw from its original strategy.

## ArcSwap

[`ArcSwap.sol`](arcvault-contracts/src/ArcSwap.sol) is a testnet-only AMM for swapping existing Arc assets into USDC before depositing into ArcVault. It does not deploy a custom token.

Live V1 pairs:

- `EURC -> USDC`
- `cirBTC -> USDC`

ArcSwap uses:

- owner-seeded liquidity
- constant-product AMM math
- `30 bps` swap fee
- `1%` frontend minimum-received protection
- no public LP shares in V1

Current UI flow:

1. Choose `EURC` or `cirBTC`.
2. Enter an amount.
3. Approve the selected token if allowance is missing.
4. After approval is confirmed on-chain, click `Swap to USDC`.
5. Deposit the received USDC into ArcVault.

USDC is not shown as a swap input because it can already be deposited directly. The frontend keeps a separate `Use USDC balance in deposit` shortcut for that flow.

Uniswap routing is marked as `Coming soon`; live swaps currently execute through ArcSwap.

## Realistic Mock Strategy

[`RealisticMockLendingStrategy.sol`](arcvault-contracts/src/RealisticMockLendingStrategy.sol) is a self-contained educational lending model for Arc Testnet. It does not connect to a real lending protocol.

It provides:

- configurable base APR in basis points
- optional utilization-based APR adjustment
- deterministic time-based yield accrual
- an APR safety cap
- prefunded USDC reserves that back simulated yield
- vault-only deposit, withdrawal, and harvest operations
- additive views for effective APR, pending yield, and available reserves

Yield is calculated from:

```text
accountedAssets * effectiveAprBps * elapsedSeconds
-------------------------------------------------
            BPS * SECONDS_PER_YEAR
```

Realized yield cannot exceed USDC reserves already held by the strategy. This keeps `accountedAssets` backed by actual testnet USDC.

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

The active stack was deployed with [`scripts/deploy-replacement-vault.js`](scripts/deploy-replacement-vault.js). The script deploys yUSDC and ArcVault, links the existing realistic strategy, funds its yield reserve, and seeds an initial deposit.

The previous vault could not safely switch strategies because its legacy strategy only allowed the vault to withdraw and the deployed vault had no administrative migration function. A fresh vault avoids hiding or stranding legacy holder assets.

ArcSwap was deployed with [`scripts/deploy-arc-swap.js`](scripts/deploy-arc-swap.js). The script:

- compiles `ArcSwap.sol`
- deploys ArcSwap with existing Arc Testnet token addresses
- checks the owner wallet's real EURC, cirBTC, and USDC balances
- approves the required token amounts
- seeds both pools
- prints `ARCSWAP_ADDRESS`

Required ArcSwap deployment environment:

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

The script intentionally fails if the owner wallet lacks real Arc Testnet EURC, cirBTC, or USDC. It does not deploy mock tokens.

## Frontend

The frontend is contained in [`index.html`](index.html).

- vanilla HTML, CSS, and JavaScript
- ethers.js v6 loaded from CDN
- GSAP 3 animations loaded from CDN
- no React or bundler
- ERC-20 USDC wallet balance using six decimals
- yUSDC position and withdrawable asset display
- address-specific local deposit cost basis
- recent `Deposited`, `Withdrawn`, and `Compounded` event history
- projected or compound-derived APY
- visible two-step USDC approval and deposit flow
- ArcSwap dashboard for `EURC -> USDC` and `cirBTC -> USDC`
- live pool reserves and swap quotes
- explicit approve-then-swap flow for ERC-20 swap inputs
- success and error toast indicators for confirmed or failed transactions
- distinct `Coming soon` treatment for future Uniswap routing

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
5. Deposit USDC directly, or swap EURC/cirBTC into USDC first.
6. Approve USDC on the first deposit.
7. Confirm the deposit transaction.
8. Withdraw by entering the amount of yUSDC shares to burn.

## Contract Tests

Foundry tests cover the vault, strategy accounting, and ArcSwap behavior.

Run:

```powershell
cd arcvault-contracts
forge test
```

Current local result:

```text
16 tests passed, 0 failed, 0 skipped
```

## Project Structure

```text
index.html
scripts/
  deploy-arc-swap.js
  keeper.js
arcvault-contracts/
  src/
    ArcSwap.sol
    ArcVault.sol
    yUSDC.sol
    MockEulerStrategy.sol
    RealisticMockLendingStrategy.sol
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
- GitHub Actions
- Vercel
- Arc Testnet

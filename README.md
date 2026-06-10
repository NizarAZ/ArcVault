# ArcVault

ArcVault is a non-custodial USDC yield vault deployed on Arc Testnet. Users deposit USDC, receive yUSDC receipt tokens, and withdraw their proportional share of the vault.

The project includes a single-file frontend, Solidity vault contracts, a deterministic mock lending strategy, and an automated keeper.

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
| ArcVault | `0xb9FA72d5BBD6417F94E692D578546DB72Fb3042e` |
| yUSDC | `0x3e96A71FFdFb947239224568CfDFD445357ABD9D` |
| Current MockEulerStrategy | `0x1Fdf6E91fdB0091017B4126f80431C41b94a66B3` |
| Arc Testnet USDC | `0x3600000000000000000000000000000000000000` |

The deployed ArcVault currently points to `MockEulerStrategy`.

`RealisticMockLendingStrategy.sol` is implemented in the repository but is not yet deployed or assigned to the live vault. Its on-chain address will be added here after deployment.

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

## Strategy Migration

To activate `RealisticMockLendingStrategy`:

1. Deploy it with Arc Testnet USDC, the ArcVault address, an owner, and APR parameters.
2. Fund its yield reserve with testnet USDC.
3. Ensure assets are not stranded in the old strategy.
4. From the ArcVault owner wallet, call:

```solidity
setStrategy(newStrategyAddress)
```

5. Call `deployIdle()` if ArcVault holds undeployed USDC.
6. Update the keeper script's `STRATEGY_ADDRESS`.
7. Update the frontend strategy address and this README.

The current ArcVault does not automatically withdraw all assets from the old strategy during `setStrategy()`. Migrate or withdraw old strategy assets before switching.

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

## Keeper

The one-shot keeper is in [`scripts/keeper.js`](scripts/keeper.js). It is designed for local execution, cron, and GitHub Actions.

The keeper:

1. Loads `PRIVATE_KEY` and `ARC_RPC`.
2. Verifies its wallet matches `vault.keeper()`.
3. Reads strategy and vault assets.
4. Skips compounding when the strategy is empty.
5. Calls `vault.compound()`.
6. Parses the `Compounded` event.
7. Logs the transaction hash, harvested yield, and new total assets.

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
5. Approve USDC on the first deposit.
6. Confirm the deposit transaction.
7. Withdraw by entering the amount of yUSDC shares to burn.

## Project Structure

```text
index.html
scripts/
  keeper.js
arcvault-contracts/
  src/
    ArcVault.sol
    yUSDC.sol
    MockEulerStrategy.sol
    RealisticMockLendingStrategy.sol
  script/
  test/
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

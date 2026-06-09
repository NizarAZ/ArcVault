# ArcVault

ArcVault is a non-custodial USDC yield vault deployed on Arc Testnet. Users deposit Arc Testnet USDC, receive yUSDC receipt tokens, and can withdraw their proportional share at any time.

Deposits are routed through a mock Euler-style strategy. Yield is compounded by a keeper wallet through the vault's `compound()` function.

## Live App

[arc-vault-kappa.vercel.app](https://arc-vault-kappa.vercel.app)

## Contracts

Arc Testnet chain ID: `5042002`

| Contract | Address |
| --- | --- |
| ArcVault | `0xb9FA72d5BBD6417F94E692D578546DB72Fb3042e` |
| yUSDC | `0x3e96A71FFdFb947239224568CfDFD445357ABD9D` |
| MockEulerStrategy | `0x1Fdf6E91fdB0091017B4126f80431C41b94a66B3` |
| USDC | `0x3600000000000000000000000000000000000000` |

## Frontend

The app is a single-file vanilla frontend in `index.html`.

- ethers.js v6 loaded from CDN
- GSAP entrance and interaction animations loaded from CDN
- no React, no bundler
- wallet USDC balance read from the USDC ERC-20 `balanceOf()`
- yUSDC position and withdrawable USDC shown from vault accounting
- local wallet deposit basis used to show personal earned USDC
- timeline loads recent `Deposited`, `Withdrawn`, and `Compounded` vault events
- APY displays either the latest compound-derived APY or a projected APY before the first compound

## Keeper Bot

The standalone keeper bot lives in `scripts/keeper.js`.

It runs one compound cycle and exits, so it is suitable for cron or GitHub Actions.

The bot:

1. Connects to Arc Testnet.
2. Loads the keeper wallet from `PRIVATE_KEY`.
3. Verifies the wallet matches `vault.keeper()`.
4. Reads strategy and vault assets.
5. Skips empty strategy state.
6. Calls `vault.compound()`.
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

Run locally:

```powershell
node --env-file=.env keeper.js
```

Only use a dedicated keeper wallet. Do not commit `.env`.

## GitHub Actions Keeper

The scheduled keeper workflow is in `.github/workflows/keeper.yml`.

It runs:

- daily at `18:00 UTC`
- manually through `workflow_dispatch`

Required GitHub secret:

```text
KEEPER_PRIVATE_KEY
```

This secret must be the private key for the wallet currently set as `vault.keeper()`.

## How to Test

1. Add Arc Testnet to MetaMask:
   - Network: Arc Testnet
   - RPC: `https://rpc.testnet.arc.network`
   - Chain ID: `5042002`
   - Symbol: `USDC`
2. Get testnet USDC from [faucet.circle.com](https://faucet.circle.com/).
3. Visit the app.
4. Connect wallet.
5. Deposit USDC.
6. Approve USDC spending on first deposit, then confirm the deposit transaction.
7. Withdraw by entering yUSDC shares.

## Stack

- Solidity 0.8.24
- Foundry
- ethers.js v6
- GSAP 3
- vanilla HTML, CSS, and JavaScript
- GitHub Actions
- Vercel
- Arc Testnet

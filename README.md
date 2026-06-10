ArcVault
ArcVault is a non‑custodial USDC yield vault deployed on Arc Testnet. Users deposit Arc Testnet USDC, receive yUSDC receipt tokens, and can withdraw their proportional share at any time.

Deposits are routed into a RealisticMockLendingStrategy, a deterministic, educational lending‑yield model that accrues time‑based APR on behalf of the vault. Yield is periodically realized by a keeper wallet calling the vault’s compound() function, which measures before/after totalAssets() to compute realized yield.

Live App
https://arc-vault-kappa.vercel.app

Contracts
Arc Testnet chain ID: 5042002

Contract	Address
ArcVault	0xb9FA72d5BBD6417F94E692D578546DB72Fb3042e
yUSDC (vault share token)	0x3e96A71FFdFb947239224568CfDFD445357ABD9D
RealisticMockLendingStrategy (Euler‑style mock)	0x1Fdf6E91fdB0091017B4126f80431C41b94a66B3
USDC (Arc Testnet gas + asset)	0x3600000000000000000000000000000000000000
Note: The strategy is a testnet‑safe mock. It does not integrate a live lending protocol; instead, it uses configurable APR parameters and time‑based accrual, capped by prefunded USDC reserves held by the strategy contract so it never “mints” yield out of thin air.

Frontend
The app is a single‑file vanilla frontend in index.html.

ethers.js v6 loaded from CDN

GSAP 3 animations loaded from CDN

No React, no bundler

Wallet USDC balance read from the USDC ERC‑20 balanceOf()

yUSDC position and withdrawable USDC derived from vault accounting and totalAssets()

Local wallet deposit basis tracked in the browser to show personal “earned USDC”

Timeline displays recent Deposited, Withdrawn, and Compounded events from ArcVault

APY displays either:

An estimate derived from realized compounding events, or

A projected APY before the first compound

Keeper Bot
The standalone keeper bot lives in scripts/keeper.js. It runs one compound cycle and exits, making it suitable for cron or GitHub Actions.

The bot:

Connects to Arc Testnet via ARC_RPC (default https://rpc.testnet.arc.network).

Loads the keeper wallet from PRIVATE_KEY.

Verifies the wallet matches vault.keeper().

Reads strategy and vault assets.

Skips if the strategy has no assets to avoid wasting gas.

Calls vault.compound().

Waits for confirmation, parses the Compounded event, and logs the transaction hash, harvested yield, and new total assets.

Local setup:

bash
cd scripts
npm install
Create scripts/.env:

text
PRIVATE_KEY=your_keeper_wallet_private_key
ARC_RPC=https://rpc.testnet.arc.network
Run locally:

bash
node --env-file=.env keeper.js
Only use a dedicated keeper wallet. Do not commit .env.

GitHub Actions Keeper
The scheduled keeper workflow is in .github/workflows/keeper.yml.

It runs:

Daily at 18:00 UTC

Manually through workflow_dispatch

Required GitHub secret:

text
KEEPER_PRIVATE_KEY
This secret must be the private key for the wallet currently set as vault.keeper(). Once configured, compounding runs fully automated from GitHub’s infrastructure; your local device does not need to be online.

How to Test
Add Arc Testnet to MetaMask:

Network: Arc Testnet

RPC: https://rpc.testnet.arc.network

Chain ID: 5042002

Symbol: USDC

Get testnet USDC from https://faucet.circle.com.

Visit the app: https://arc-vault-kappa.vercel.app.

Connect your wallet.

Deposit USDC.

Approve USDC spending on first deposit, then confirm the deposit transaction.

After the keeper has compounded at least once, observe your “earned USDC” and the Compounded events.

Withdraw by entering yUSDC shares in the Withdraw panel.

Stack
Solidity 0.8.24 + Foundry

ethers.js v6

GSAP 3

Vanilla HTML, CSS, and JavaScript

GitHub Actions (keeper automation)

Vercel (frontend hosting)

Arc Testnet (USDC as gas, sub‑second finality)



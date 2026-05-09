\# ArcVault



A non-custodial USDC yield vault deployed on Arc Testnet.  

Deposits are routed through an Euler lending strategy. Yield is compounded by a keeper bot.



\## Live App

\[arc-vault-kappa.vercel.app](https://arc-vault-kappa.vercel.app)



\## Contracts (Arc Testnet — Chain 5042002)

| Contract | Address |

|----------|---------|

| ArcVault | `0xb9FA72d5BBD6417F94E692D578546DB72Fb3042e` |

| yUSDC    | `0x3e96A71FFdFb947239224568CfDFD445357ABD9D` |

| MockEulerStrategy | `0x24267FEF37e408C750F3757284c35e138ee2f6d2` |

\## How to Test

1\. Add Arc Testnet to MetaMask:

&#x20;  - Network: Arc Testnet

&#x20;  - RPC: `https://rpc.testnet.arc.network`

&#x20;  - Chain ID: `5042002`

&#x20;  - Symbol: `USDC`

2\. Get testnet USDC from \[faucet.circle.com](https://faucet.circle.com/)

3\. Visit the app, connect wallet, deposit USDC



\## Stack

\- Solidity 0.8.24 + Foundry

\- ethers.js v6

\- Vercel (frontend)

\- Arc Testnet


# Arc

> Arc is an open Layer-1 blockchain purpose-built for programmable money.
> USDC is the native gas token. Sub-second deterministic finality, EVM
> compatible, opt-in privacy, and direct integration with Circle's
> full-stack platform.

## Getting Started — Use the Skill First

| Product | Skill | What it covers |
|---------|-------|----------------|
| Arc | [use-arc](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-arc/SKILL.md) | Chain config, RPC setup, contract deployment, USDC bridging, gas with USDC |

### Installing Circle Skills

**Claude Code:**
```
/plugin marketplace add circlefin/skills
/plugin install circle-skills@circle
```

**Vercel Skills CLI:**
```
npx skills add circlefin/skills
```

## Instructions for AI Agents

Follow these guidelines when building on Arc:

1. **USDC is the gas token.** Arc uses USDC for gas fees, not ETH. Configure gas payment in USDC when submitting transactions.

2. **EVM compatible.** Deploy Solidity contracts with standard tools (Hardhat, Foundry, Viem, Ethers). See [EVM Compatibility](https://docs.arc.network/arc/references/evm-compatibility.md) for differences.

3. **Sub-second finality.** Transactions are final in under 1 second. No need to wait for multiple block confirmations.

4. **Use App Kit for bridging, swaps, and unified balance.** App Kit wraps CCTP and provides Bridge, Swap, Send, and Unified Balance capabilities. Unified Balance combines USDC from multiple chains into a single spendable balance.

5. **Testnet.** Arc is currently available on Testnet only. [Connect to Arc](https://docs.arc.network/arc/references/connect-to-arc.md) for RPC endpoints. [Faucet](https://faucet.circle.com) for testnet tokens.

6. **Always check Contract Addresses**: https://docs.arc.network/arc/references/contract-addresses.md

## Arc Network

- [Arc Network Overview](https://docs.arc.network/arc-chain.md): Architecture and core developer platform
- [System Overview](https://docs.arc.network/arc/concepts/system-overview.md): Consensus + execution layer architecture
- [Stable Fee Design](https://docs.arc.network/arc/concepts/stable-fee-design.md): USDC as gas, predictable fees
- [Deterministic Finality](https://docs.arc.network/arc/concepts/deterministic-finality.md): Instant, irreversible settlement
- [Opt-in Privacy](https://docs.arc.network/arc/concepts/opt-in-privacy.md): Confidential transactions with selective disclosure
- [Post-quantum Security](https://docs.arc.network/arc/concepts/post-quantum-security.md): Quantum-resilient security roadmap
- [Connect to Arc](https://docs.arc.network/arc/references/connect-to-arc.md): RPC endpoints and wallet setup
- [Contract Addresses](https://docs.arc.network/arc/references/contract-addresses.md): USDC, EURC, CCTP, Gateway addresses
- [EVM Compatibility](https://docs.arc.network/arc/references/evm-compatibility.md): Differences from standard EVM
- [Gas and Fees](https://docs.arc.network/arc/references/gas-and-fees.md): Fee model and pricing

## Build on Arc

- [Build Overview](https://docs.arc.network/build.md): Quickstarts, tutorials, and SDKs
- [Sample Applications](https://docs.arc.network/arc/references/sample-applications.md): Open source examples
- [Deploy on Arc](https://docs.arc.network/arc/tutorials/deploy-on-arc.md): Deploy a Solidity contract on Arc Testnet
- [Deploy Contracts (Circle)](https://docs.arc.network/arc/tutorials/deploy-contracts.md): Deploy templates via Circle Contracts
- [Interact with Contracts](https://docs.arc.network/arc/tutorials/interact-with-contracts.md): Call contract functions
- [Monitor Contract Events](https://docs.arc.network/arc/tutorials/monitor-contract-events.md): Track onchain activity
- [Unified Balance](https://docs.arc.network/app-kit/unified-balance.md): Combine USDC from multiple blockchains into a single, instantly spendable balance

### AI and Agents

- [Arc MCP Server](https://docs.arc.network/ai/mcp.md): Connect AI tools to Arc documentation via MCP
- [Agentic Economy](https://docs.arc.network/build/agentic-economy.md): Onchain identity and job settlement for AI agents
- [Register an AI Agent](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent.md): ERC-8004 onchain identity and reputation
- [Create an ERC-8183 Job](https://docs.arc.network/arc/tutorials/create-your-first-erc-8183-job.md): Escrow, deliverables, settlement

## App Kit — Bridge, Swap, Send, Unified Balance

- [App Kit Overview](https://docs.arc.network/app-kit.md): Payment and liquidity workflows across chains
- [Install App Kit](https://docs.arc.network/app-kit/tutorials/installation.md): Core package and adapters
- [Adapter Setups](https://docs.arc.network/app-kit/tutorials/adapter-setups.md): Viem, Ethers, Solana, Circle Wallets

### Bridge
- [App Kit: Bridge](https://docs.arc.network/app-kit/bridge.md): Transfer USDC across chains
- [Quickstart: Bridge Tokens](https://docs.arc.network/app-kit/quickstarts/bridge-tokens-across-blockchains.md): Bridge between EVM chains, Solana, and Circle Wallets
- [Bridge Fees](https://docs.arc.network/app-kit/concepts/bridge-fees.md): Fee breakdown
- [Error Recovery](https://docs.arc.network/app-kit/references/bridge-error-recovery.md): Troubleshooting failed bridges

### Swap
- [App Kit: Swap](https://docs.arc.network/app-kit/swap.md): Token swaps on same chain
- [Quickstart: Same-Chain Swap](https://docs.arc.network/app-kit/quickstarts/swap-tokens-same-chain.md): Swap tokens on one chain
- [Quickstart: Crosschain Swap](https://docs.arc.network/app-kit/quickstarts/swap-tokens-crosschain.md): Swap + bridge
- [Swap Fees](https://docs.arc.network/app-kit/concepts/swap-fees.md): Fee breakdown

### Send
- [App Kit: Send](https://docs.arc.network/app-kit/send.md): Wallet-to-wallet on same chain
- [Quickstart: Send Tokens](https://docs.arc.network/app-kit/quickstarts/send-tokens-same-chain.md): Send tokens between wallets

### Unified Balance
- [App Kit: Unified Balance](https://docs.arc.network/app-kit/unified-balance.md): Chain-agnostic USDC balance, spend on any blockchain
- [Quickstart: Deposit and Spend](https://docs.arc.network/app-kit/quickstarts/unified-balance-deposit-and-spend.md): Deposit USDC and spend crosschain
- [Unified Balance Fees](https://docs.arc.network/app-kit/concepts/unified-balance-fees.md): Fee breakdown

### Reference
- [SDK Reference](https://docs.arc.network/app-kit/references/sdk-reference.md): Full API reference
- [Supported Blockchains](https://docs.arc.network/app-kit/references/supported-blockchains.md): Chains and tokens

## Integrate with Arc

- [Integrate Overview](https://docs.arc.network/integrate.md): Connect wallets, exchanges, and infrastructure
- [Connect to Arc](https://docs.arc.network/integrate/connect-to-arc.md): Network details and RPC endpoints for integrators
- [Deploy on Arc](https://docs.arc.network/integrate/deploy-on-arc.md): Deployment guide for integrators
- [Running a Node](https://docs.arc.network/arc/concepts/running-a-node.md): Node architecture and roles
- [Run an Arc Node](https://docs.arc.network/arc/tutorials/run-an-arc-node.md): Step-by-step node setup

## Tools and Infrastructure

- [Node Providers](https://docs.arc.network/arc/tools/node-providers.md): RPC access providers
- [Data Indexers](https://docs.arc.network/arc/tools/data-indexers.md): APIs and sub-graphs
- [Oracles](https://docs.arc.network/arc/tools/oracles.md): Price feeds and offchain data
- [Account Abstraction](https://docs.arc.network/arc/tools/account-abstraction.md): AA providers and paymasters
- [Compliance](https://docs.arc.network/arc/tools/compliance-vendors.md): Analytics and screening tools
- [Explorer](https://testnet.arcscan.app): Arc Testnet block explorer
- [Faucet](https://faucet.circle.com): Testnet token faucet

## More Circle Skills

Building beyond Arc? Circle offers skills for the full platform:

| Product | Skill |
|---------|-------|
| USDC | [use-usdc](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-usdc/SKILL.md) |
| Wallets (overview) | [use-circle-wallets](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-circle-wallets/SKILL.md) |
| Developer-Controlled Wallets | [use-developer-controlled-wallets](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-developer-controlled-wallets/SKILL.md) |
| User-Controlled Wallets | [use-user-controlled-wallets](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-user-controlled-wallets/SKILL.md) |
| Modular Wallets | [use-modular-wallets](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-modular-wallets/SKILL.md) |
| Gateway / Nanopayments | [use-gateway](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-gateway/SKILL.md) |
| Smart Contracts | [use-smart-contract-platform](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-smart-contract-platform/SKILL.md) |

Full Circle developer docs: [developers.circle.com/llms.txt](https://developers.circle.com/llms.txt)
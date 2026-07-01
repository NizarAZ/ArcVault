# ArcVault Contracts

ArcVault is a USDC yield vault for Arc Testnet. Users deposit USDC, receive yUSDC receipt shares, and withdraw their proportional claim at any time. The vault is designed for one Morpho vault strategy on Arc Testnet, with a keeper address allowed to call `compound()`.

Arc Testnet details:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

Active deployment:

- ArcVault: `0xf6BEB2719018814fa034006Fa1e7Be5a4f08D21c`
- yUSDC: `0xF9a536cbb52a6AEC3b233883958bB4b6102156bA`
- MorphoVaultStrategy: `0xD6bE89da890AcC2D2792A74a67a6897fc7758E98`

External dependency:

- Morpho VaultV2, an Arc ecosystem lending partner vault deployed by a third party on Arc Testnet: `0xaabbef1d3971c710276ed41ec791bbe14cdb8e88`

## Setup

Install Foundry dependencies:

```sh
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install foundry-rs/forge-std
```

Copy the environment template:

```sh
cp .env.example .env
```

Set:

- `PRIVATE_KEY`: deployer private key
- `KEEPER_ADDRESS`: address allowed to call `compound()`
- `STRATEGY_ADDRESS`: optional strategy adapter address

If `STRATEGY_ADDRESS` is omitted, the vault deploys without an active strategy and the owner can attach one later with `setStrategy(address)`.

## Test

```sh
forge test
```

## Deploy

```sh
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $PRIVATE_KEY
```

The deploy script returns two different addresses:

- `ArcVault`: the vault address used for `deposit`, `withdraw`, `setStrategy`, and `strategy()`.
- `yUSDC`: the receipt token address used for `balanceOf`.

Do not use the yUSDC token address as the vault address. Calls such as `strategy()` will revert on yUSDC because that function only exists on ArcVault.

The operator flow is:

1. Deploy yUSDC and ArcVault with `script/Deploy.s.sol`.
2. Confirm the `ArcVault` and `yUSDC` addresses printed in the logs.
3. Deploy the strategy.
4. Configure the strategy on the real ArcVault address.
5. Optionally call `deployIdle()` after strategy setup.

For the Morpho vault strategy:

```sh
VAULT_ADDRESS=<arc-vault-address> forge script script/DeployMorphoVaultStrategy.s.sol --rpc-url arc_testnet --broadcast --private-key $PRIVATE_KEY
```

## Configure Strategy

For an already deployed vault, set:

```sh
VAULT_ADDRESS=<arc-vault-address>
STRATEGY_ADDRESS=<strategy-address>
DEPLOY_IDLE=false
```

Then run:

```sh
forge script script/ConfigureStrategy.s.sol --rpc-url arc_testnet --broadcast --private-key $PRIVATE_KEY
```

`ConfigureStrategy.s.sol` validates that `VAULT_ADDRESS` is an ArcVault by checking `receiptToken()` and the yUSDC `vault()` back-link before broadcasting. Passing a yUSDC address as `VAULT_ADDRESS` fails early with `InvalidVaultAddress`.

`setStrategy(address)` only stores the strategy address. If the vault already holds idle USDC and you want to push it into the strategy, set `DEPLOY_IDLE=true` or call `deployIdle()` in a separate owner transaction.

## Contract Layout

- `src/ArcVault.sol`: vault accounting, deposits, withdrawals, keeper compounding, and strategy integration interface.
- `src/yUSDC.sol`: ERC-20 receipt token mintable and burnable only by ArcVault.
- `src/MorphoVaultStrategy.sol`: Morpho VaultV2 strategy adapter.
- `script/Deploy.s.sol`: deploys yUSDC, deploys ArcVault, then links the receipt token to the vault.
- `script/DeployMorphoVaultStrategy.s.sol`: deploys the Morpho vault strategy against Arc Testnet USDC and the Morpho VaultV2.
- `script/ConfigureStrategy.s.sol`: sets an existing vault strategy and optionally deploys idle funds.
- `test/ArcVault.t.sol`: basic deposit, withdrawal, share math, and keeper access tests.
- `test/MorphoVaultStrategy.t.sol`: Morpho vault deposit, withdrawal, harvest, and totalAssets tests.

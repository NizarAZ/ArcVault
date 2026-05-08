# ArcVault Contracts

ArcVault is a USDC yield vault for Arc Testnet. Users deposit USDC, receive yUSDC receipt shares, and withdraw their proportional claim at any time. The vault is designed for one Euler lending strategy on Arc Testnet, with a keeper address allowed to call `compound()`.

Arc Testnet details:

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`

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
- `EULER_STRATEGY_ADDRESS`: optional Euler strategy adapter address

If `EULER_STRATEGY_ADDRESS` is omitted, the vault deploys without an active strategy and the owner can attach one later with `setStrategy(address)`.

## Test

```sh
forge test
```

## Deploy

```sh
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $PRIVATE_KEY
```

## Contract Layout

- `src/ArcVault.sol`: vault accounting, deposits, withdrawals, keeper compounding, and Euler strategy integration interface.
- `src/yUSDC.sol`: ERC-20 receipt token mintable and burnable only by ArcVault.
- `script/Deploy.s.sol`: deploys yUSDC, deploys ArcVault, then links the receipt token to the vault.
- `test/ArcVault.t.sol`: basic deposit, withdrawal, share math, and keeper access tests.

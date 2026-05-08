// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract yUSDC is ERC20, Ownable {
    error ZeroAddress();
    error VaultAlreadySet();
    error NotVault();

    address public vault;
    uint8 private immutable tokenDecimals;

    constructor(address initialOwner, uint8 decimals_) ERC20("ArcVault yUSDC", "yUSDC") Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        tokenDecimals = decimals_;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    function setVault(address vault_) external onlyOwner {
        if (vault_ == address(0)) revert ZeroAddress();
        if (vault != address(0)) revert VaultAlreadySet();
        vault = vault_;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./PreminedToken.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";

/// @dev Just a wrapper for premined tokens which can actually be burnt
contract BurnableToken is PreminedToken, ERC20Burnable {
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public PreminedToken(_name, _symbol, _decimals) {}
}

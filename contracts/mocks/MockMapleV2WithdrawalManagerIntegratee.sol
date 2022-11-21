// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockMapleV2WithdrawalManager Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An integratee that simulates interactions with MapleV2 Withdrawal Manager
contract MockMapleV2WithdrawalManagerIntegratee {
    address public poolToken;

    constructor(address _poolToken) public {
        poolToken = _poolToken;
    }

    function lockedShares(address) public view returns (uint256) {
        return ERC20(poolToken).balanceOf(address(this));
    }
}

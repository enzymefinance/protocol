// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./MockMapleV2WithdrawalManagerIntegratee.sol";

/// @title MockMapleV2PoolManagerIntegratee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An integratee that simulates interactions with Maple V2 Pool Manager
contract MockMapleV2PoolManagerIntegratee {
    address public withdrawalManager;

    constructor(address _poolToken) public {
        withdrawalManager = address(new MockMapleV2WithdrawalManagerIntegratee(_poolToken));
    }
}

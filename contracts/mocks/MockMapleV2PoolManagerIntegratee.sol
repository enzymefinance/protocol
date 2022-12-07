// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/interfaces/IMapleV2PoolManager.sol";
import "./MockMapleV2PoolFactoryIntegratee.sol";
import "./MockMapleV2WithdrawalManagerIntegratee.sol";

/// @title MockMapleV2PoolManagerIntegratee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An integratee that simulates interactions with Maple V2 Pool Manager
contract MockMapleV2PoolManagerIntegratee is IMapleV2PoolManager {
    address public override factory;
    address public override pool;
    address public override withdrawalManager;

    constructor(address _poolToken) public {
        pool = _poolToken;
        factory = address(new MockMapleV2PoolFactoryIntegratee(address(this)));
        withdrawalManager = address(new MockMapleV2WithdrawalManagerIntegratee(_poolToken));
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {KilnStakingPositionLibBase1} from "./KilnStakingPositionLibBase1.sol";

/// @title KilnStakingPositionLibBase2 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a KilnStakingPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered KilnStakingPositionLibBaseXXX that inherits the previous base.
/// e.g., `KilnStakingPositionLibBase2 is KilnStakingPositionLibBase1`
abstract contract KilnStakingPositionLibBase2 is KilnStakingPositionLibBase1 {
    bool internal positionValuePaused;

    event PositionValuePaused();

    event PositionValueUnpaused();

    event ValidatorsRemoved(address stakingContractAddress, uint256 validatorAmount);
}

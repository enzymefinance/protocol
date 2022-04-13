// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./GlobalConfigLibBaseCore.sol";

/// @title GlobalConfigLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base implementation for GlobalConfigLib
/// @dev Each next base implementation inherits the previous base implementation,
/// e.g., `GlobalConfigLibBase2 is GlobalConfigLibBase1`
/// DO NOT EDIT CONTRACT.
abstract contract GlobalConfigLibBase1 is GlobalConfigLibBaseCore {
    address
        internal constant NO_VALIDATION_DUMMY_ADDRESS = 0x000000000000000000000000000000000000aaaa;
    // Don't use max, since a max value can be valid
    uint256 internal constant NO_VALIDATION_DUMMY_AMOUNT = type(uint256).max - 1;
}

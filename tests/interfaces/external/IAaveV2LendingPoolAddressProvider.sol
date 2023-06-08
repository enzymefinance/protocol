// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IAaveV2LendingPool} from "./IAaveV2LendingPool.sol";

/// @title IAaveV2LendingPoolAddressProvider interface
/// @author Enzyme Council <security@enzyme.finance>

interface IAaveV2LendingPoolAddressProvider {
    function getLendingPool() external view returns (IAaveV2LendingPool pool_);
}

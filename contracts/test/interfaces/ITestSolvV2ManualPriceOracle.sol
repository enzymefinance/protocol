// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestSolvV2ManualPriceOracle Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Manual Price Oracle
interface ITestSolvV2ManualPriceOracle {
    function _setPrice(
        address underlying_,
        uint64 maturity_,
        int256 price_
    ) external;
}

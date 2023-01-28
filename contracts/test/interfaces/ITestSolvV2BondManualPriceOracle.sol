// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestSolvV2BondManualPriceOracle Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Manual Price Oracle
interface ITestSolvV2BondManualPriceOracle {
    function setPrice(
        address _base,
        address _anchor,
        uint64 _timestamp,
        int256 _price
    ) external;
}

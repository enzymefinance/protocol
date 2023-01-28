// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestSolvV2BondPriceOracleManager Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for Solv V2 Price Oracle Manager
interface ITestSolvV2BondPriceOracleManager {
    function getOracle(address _voucher) external view returns (address oracle_);

    function getPriceOfMaturity(
        address _voucher,
        address _fundCurrency,
        uint64 _maturity
    ) external view returns (int256 price_);

    function _setVoucherOracle(address _voucher, address _oracle) external;
}

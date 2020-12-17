// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title ISynthetixExchangeRates Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISynthetixExchangeRates {
    function rateAndInvalid(bytes32) external view returns (uint256, bool);
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @dev Minimal interface for our interactions with the Kyber ConversionRates
interface IConversionRates {
    function setValidRateDurationInBlocks(uint256) external;
}

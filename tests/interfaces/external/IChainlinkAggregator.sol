// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

/// @title IChainlinkAggregator Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IChainlinkAggregator {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

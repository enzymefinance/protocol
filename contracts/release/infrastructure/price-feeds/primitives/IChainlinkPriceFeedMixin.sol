// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IChainlinkPriceFeedMixin Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for ChainlinkPriceFeedMixin
interface IChainlinkPriceFeedMixin {
    enum RateAsset {
        ETH,
        USD
    }

    struct AggregatorInfo {
        address aggregator;
        RateAsset rateAsset;
    }

    function getAggregatorForPrimitive(address _primitive) external view returns (address aggregator_);

    function getEthUsdAggregator() external view returns (address ethUsdAggregator_);

    function getRateAssetForPrimitive(address _primitive) external view returns (RateAsset rateAsset_);

    function getStaleRateThreshold() external view returns (uint256 staleRateThreshold_);

    function getUnitForPrimitive(address _primitive) external view returns (uint256 unit_);

    function getWethToken() external view returns (address wethToken_);
}

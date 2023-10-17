// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IAggregatedDerivativePriceFeedMixin} from "../price-feeds/derivatives/IAggregatedDerivativePriceFeedMixin.sol";
import {IChainlinkPriceFeedMixin} from "../price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

/// @title IValueInterpreter interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for ValueInterpreter
interface IValueInterpreter is IAggregatedDerivativePriceFeedMixin, IChainlinkPriceFeedMixin {
    function addDerivatives(address[] calldata _derivatives, address[] calldata _priceFeeds) external;

    function addPrimitives(
        address[] calldata _primitives,
        address[] calldata _aggregators,
        RateAsset[] calldata _rateAssets
    ) external;

    function calcCanonicalAssetValue(address _baseAsset, uint256 _amount, address _quoteAsset)
        external
        returns (uint256 value_);

    function calcCanonicalAssetsTotalValue(address[] memory _baseAssets, uint256[] memory _amounts, address _quoteAsset)
        external
        returns (uint256 value_);

    function isSupportedAsset(address _asset) external view returns (bool isSupported_);

    function isSupportedDerivativeAsset(address _asset) external view returns (bool isSupported_);

    function isSupportedPrimitiveAsset(address _asset) external view returns (bool isSupported_);

    function removeDerivatives(address[] calldata _derivatives) external;

    function removePrimitives(address[] calldata _primitives) external;

    function setEthUsdAggregator(address _nextEthUsdAggregator) external;

    function updateDerivatives(address[] calldata _derivatives, address[] calldata _priceFeeds) external;

    function updatePrimitives(
        address[] calldata _primitives,
        address[] calldata _aggregators,
        RateAsset[] calldata _rateAssets
    ) external;
}

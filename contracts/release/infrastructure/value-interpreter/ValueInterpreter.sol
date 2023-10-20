// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ERC20} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {MathHelpersLib} from "../../../utils/0.8.19/MathHelpersLib.sol";
import {FundDeployerOwnerMixin} from "../../utils/0.8.19/FundDeployerOwnerMixin.sol";
import {AggregatedDerivativePriceFeedMixin} from "../price-feeds/derivatives/AggregatedDerivativePriceFeedMixin.sol";
import {IDerivativePriceFeed} from "../price-feeds/derivatives/IDerivativePriceFeed.sol";
import {ChainlinkPriceFeedMixin} from "../price-feeds/primitives/ChainlinkPriceFeedMixin.sol";
import {IValueInterpreter} from "./IValueInterpreter.sol";

/// @title ValueInterpreter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interprets price feeds to provide covert value between asset pairs
contract ValueInterpreter is
    IValueInterpreter,
    FundDeployerOwnerMixin,
    AggregatedDerivativePriceFeedMixin,
    ChainlinkPriceFeedMixin
{
    // Used to only tolerate a max rounding discrepancy of 0.01%
    // when converting values via an inverse rate
    uint256 private constant MIN_INVERSE_RATE_AMOUNT = 10000;

    constructor(address _fundDeployer, address _wethToken, uint256 _chainlinkStaleRateThreshold)
        FundDeployerOwnerMixin(_fundDeployer)
        ChainlinkPriceFeedMixin(_wethToken, _chainlinkStaleRateThreshold)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the total value of given amounts of assets in a single quote asset
    /// @param _baseAssets The assets to convert
    /// @param _amounts The amounts of the _baseAssets to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The sum value of _baseAssets, denominated in the _quoteAsset
    /// @dev Does not alter protocol state,
    /// but not a view because calls to price feeds can potentially update third party state.
    /// Does not handle a derivative quote asset.
    function calcCanonicalAssetsTotalValue(address[] memory _baseAssets, uint256[] memory _amounts, address _quoteAsset)
        external
        override
        returns (uint256 value_)
    {
        require(_baseAssets.length == _amounts.length, "calcCanonicalAssetsTotalValue: Arrays unequal lengths");
        require(isSupportedPrimitiveAsset(_quoteAsset), "calcCanonicalAssetsTotalValue: Unsupported _quoteAsset");

        for (uint256 i; i < _baseAssets.length; i++) {
            uint256 assetValue = __calcAssetValue(_baseAssets[i], _amounts[i], _quoteAsset);
            value_ += assetValue;
        }

        return value_;
    }

    // PUBLIC FUNCTIONS

    /// @notice Calculates the value of a given amount of one asset in terms of another asset
    /// @param _baseAsset The asset from which to convert
    /// @param _amount The amount of the _baseAsset to convert
    /// @param _quoteAsset The asset to which to convert
    /// @return value_ The equivalent quantity in the _quoteAsset
    /// @dev Does not alter protocol state,
    /// but not a view because calls to price feeds can potentially update third party state.
    /// See also __calcPrimitiveToDerivativeValue() for important notes regarding a derivative _quoteAsset.
    function calcCanonicalAssetValue(address _baseAsset, uint256 _amount, address _quoteAsset)
        external
        override
        returns (uint256 value_)
    {
        if (_baseAsset == _quoteAsset || _amount == 0) {
            return _amount;
        }

        if (isSupportedPrimitiveAsset(_quoteAsset)) {
            return __calcAssetValue(_baseAsset, _amount, _quoteAsset);
        } else if (isSupportedDerivativeAsset(_quoteAsset) && isSupportedPrimitiveAsset(_baseAsset)) {
            return __calcPrimitiveToDerivativeValue(_baseAsset, _amount, _quoteAsset);
        }

        revert("calcCanonicalAssetValue: Unsupported conversion");
    }

    /// @notice Checks whether an asset is a supported asset
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is a supported asset
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return isSupportedPrimitiveAsset(_asset) || isSupportedDerivativeAsset(_asset);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to differentially calculate an asset value
    /// based on if it is a primitive or derivative asset.
    function __calcAssetValue(address _baseAsset, uint256 _amount, address _quoteAsset)
        private
        returns (uint256 value_)
    {
        if (_baseAsset == _quoteAsset || _amount == 0) {
            return _amount;
        }

        // Handle case that asset is a primitive
        if (isSupportedPrimitiveAsset(_baseAsset)) {
            return __calcCanonicalValue(_baseAsset, _amount, _quoteAsset);
        }

        // Handle case that asset is a derivative
        address derivativePriceFeed = getPriceFeedForDerivative(_baseAsset);
        if (derivativePriceFeed != address(0)) {
            return __calcDerivativeValue(derivativePriceFeed, _baseAsset, _amount, _quoteAsset);
        }

        revert("__calcAssetValue: Unsupported _baseAsset");
    }

    /// @dev Helper to calculate the value of a derivative in an arbitrary asset.
    /// Handles multiple underlying assets (e.g., Uniswap and Balancer pool tokens).
    /// Handles underlying assets that are also derivatives (e.g., a cDAI-ETH LP)
    function __calcDerivativeValue(
        address _derivativePriceFeed,
        address _derivative,
        uint256 _amount,
        address _quoteAsset
    ) private returns (uint256 value_) {
        (address[] memory underlyings, uint256[] memory underlyingAmounts) =
            IDerivativePriceFeed(_derivativePriceFeed).calcUnderlyingValues(_derivative, _amount);

        require(underlyings.length > 0, "__calcDerivativeValue: No underlyings");
        require(underlyings.length == underlyingAmounts.length, "__calcDerivativeValue: Arrays unequal lengths");

        for (uint256 i = 0; i < underlyings.length; i++) {
            uint256 underlyingValue = __calcAssetValue(underlyings[i], underlyingAmounts[i], _quoteAsset);

            value_ += underlyingValue;
        }
    }

    /// @dev Helper to calculate the value of a primitive base asset in a derivative quote asset.
    /// Assumes that the _primitiveBaseAsset and _derivativeQuoteAsset have been validated as supported.
    /// Callers of this function should be aware of the following points, and take precautions as-needed,
    /// such as prohibiting a derivative quote asset:
    /// - The returned value will be slightly less the actual canonical value due to the conversion formula's
    /// handling of the intermediate inverse rate (see comments below).
    /// - If the assets involved have an extreme rate and/or have a low ERC20.decimals() value,
    /// the inverse rate might not be considered "sufficient", and will revert.
    function __calcPrimitiveToDerivativeValue(
        address _primitiveBaseAsset,
        uint256 _primitiveBaseAssetAmount,
        address _derivativeQuoteAsset
    ) private returns (uint256 value_) {
        uint256 derivativeUnit = 10 ** uint256(ERC20(_derivativeQuoteAsset).decimals());

        address derivativePriceFeed = getPriceFeedForDerivative(_derivativeQuoteAsset);
        uint256 primitiveAmountForDerivativeUnit =
            __calcDerivativeValue(derivativePriceFeed, _derivativeQuoteAsset, derivativeUnit, _primitiveBaseAsset);
        // Only tolerate a max rounding discrepancy
        require(
            primitiveAmountForDerivativeUnit > MIN_INVERSE_RATE_AMOUNT,
            "__calcPrimitiveToDerivativeValue: Insufficient rate"
        );

        // Adds `1` to primitiveAmountForDerivativeUnit so that the final return value is
        // slightly less than the actual value, which is congruent with how all other
        // asset conversions are floored in the protocol.
        return MathHelpersLib.calcRelativeQuantity(
            primitiveAmountForDerivativeUnit + 1, derivativeUnit, _primitiveBaseAssetAmount
        );
    }

    ////////////////////////////
    // PRIMITIVES (CHAINLINK) //
    ////////////////////////////

    /// @notice Adds a list of primitives with the given aggregator and rateAsset values
    /// @param _primitives The primitives to add
    /// @param _aggregators The ordered aggregators corresponding to the list of _primitives
    /// @param _rateAssets The ordered rate assets corresponding to the list of _primitives
    function addPrimitives(
        address[] calldata _primitives,
        address[] calldata _aggregators,
        RateAsset[] calldata _rateAssets
    ) external override onlyFundDeployerOwner {
        __addPrimitives(_primitives, _aggregators, _rateAssets);
    }

    /// @notice Removes a list of primitives from the feed
    /// @param _primitives The primitives to remove
    function removePrimitives(address[] calldata _primitives) external override onlyFundDeployerOwner {
        __removePrimitives(_primitives);
    }

    /// @notice Sets the `ehUsdAggregator` variable value
    /// @param _nextEthUsdAggregator The `ehUsdAggregator` value to set
    function setEthUsdAggregator(address _nextEthUsdAggregator) external override onlyFundDeployerOwner {
        __setEthUsdAggregator(_nextEthUsdAggregator);
    }

    /// @notice Updates a list of primitives with the given aggregator and rateAsset values
    /// @param _primitives The primitives to update
    /// @param _aggregators The ordered aggregators corresponding to the list of _primitives
    /// @param _rateAssets The ordered rate assets corresponding to the list of _primitives
    function updatePrimitives(
        address[] calldata _primitives,
        address[] calldata _aggregators,
        RateAsset[] calldata _rateAssets
    ) external override onlyFundDeployerOwner {
        __removePrimitives(_primitives);
        __addPrimitives(_primitives, _aggregators, _rateAssets);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether an asset is a supported primitive
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is a supported primitive
    function isSupportedPrimitiveAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == getWethToken() || getAggregatorForPrimitive(_asset) != address(0);
    }

    ////////////////////////////////////
    // DERIVATIVE PRICE FEED REGISTRY //
    ////////////////////////////////////

    /// @notice Adds a list of derivatives with the given price feed values
    /// @param _derivatives The derivatives to add
    /// @param _priceFeeds The ordered price feeds corresponding to the list of _derivatives
    function addDerivatives(address[] calldata _derivatives, address[] calldata _priceFeeds)
        external
        override
        onlyFundDeployerOwner
    {
        __addDerivatives(_derivatives, _priceFeeds);
    }

    /// @notice Removes a list of derivatives
    /// @param _derivatives The derivatives to remove
    function removeDerivatives(address[] calldata _derivatives) external override onlyFundDeployerOwner {
        __removeDerivatives(_derivatives);
    }

    /// @notice Updates a list of derivatives with the given price feed values
    /// @param _derivatives The derivatives to update
    /// @param _priceFeeds The ordered price feeds corresponding to the list of _derivatives
    function updateDerivatives(address[] calldata _derivatives, address[] calldata _priceFeeds)
        external
        override
        onlyFundDeployerOwner
    {
        __removeDerivatives(_derivatives);
        __addDerivatives(_derivatives, _priceFeeds);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether an asset is a supported derivative
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is a supported derivative
    function isSupportedDerivativeAsset(address _asset) public view override returns (bool isSupported_) {
        return getPriceFeedForDerivative(_asset) != address(0);
    }
}

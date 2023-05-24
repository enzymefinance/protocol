// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "../../../../../external-interfaces/IGoldfinchConfig.sol";
import "../../../../../external-interfaces/IGoldfinchSeniorPool.sol";
import "../IDerivativePriceFeed.sol";

/// @title FiduPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed for Goldfinch FIDU token
contract FiduPriceFeed is IDerivativePriceFeed {
    using SafeMath for uint256;

    // usdcAmount = fiduAmount * sharePrice * usdcUnit(1e6) / fiduUnit(1e18) / sharePriceUnit(1e18)
    // usdcAmount = fiduAmount * sharePrice / 1e30
    uint256 private constant FIDU_TO_USDC_DIVISOR = 1e30;
    // https://github.com/goldfinch-eng/goldfinch-contracts/blob/main/V2.2/protocol/core/ConfigOptions.sol#L20
    uint256 private constant WITHDRAW_FEE_DENOMINATOR_CONFIG_INDEX = 4;

    address private immutable FIDU;
    IGoldfinchSeniorPool private immutable GOLDFINCH_SENIOR_POOL_CONTRACT;
    address private immutable USDC;

    constructor(address _fidu, address _goldfinchSeniorPool, address _usdc) public {
        FIDU = _fidu;
        GOLDFINCH_SENIOR_POOL_CONTRACT = IGoldfinchSeniorPool(_goldfinchSeniorPool);
        USDC = _usdc;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        require(isSupportedAsset(_derivative), "calcUnderlyingValues: Unsupported derivative");

        uint256 usdcRawAmount =
            _derivativeAmount.mul(GOLDFINCH_SENIOR_POOL_CONTRACT.sharePrice()).div(FIDU_TO_USDC_DIVISOR);

        uint256 withdrawFeeDenominator =
            IGoldfinchConfig(GOLDFINCH_SENIOR_POOL_CONTRACT.config()).getNumber(WITHDRAW_FEE_DENOMINATOR_CONFIG_INDEX);
        uint256 usdcWithdrawFee = usdcRawAmount.div(withdrawFeeDenominator);

        underlyings_ = new address[](1);
        underlyings_[0] = USDC;
        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = usdcRawAmount.sub(usdcWithdrawFee);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == FIDU;
    }
}

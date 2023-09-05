// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../staking-wrappers/convex-curve-lp/IConvexCurveLpStakingWrapperFactory.sol";
import "../IDerivativePriceFeed.sol";

/// @title ConvexCurveLpStakingWrapperPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for wrapped Convex-staked Curve LP tokens
contract ConvexCurveLpStakingWrapperPriceFeed is IDerivativePriceFeed {
    IConvexCurveLpStakingWrapperFactory private immutable WRAPPER_FACTORY;

    constructor(address _wrapperFactory) public {
        WRAPPER_FACTORY = IConvexCurveLpStakingWrapperFactory(_wrapperFactory);
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
        underlyings_ = new address[](1);
        underlyings_[0] = WRAPPER_FACTORY.getCurveLpTokenForWrapper(_derivative);

        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = _derivativeAmount;

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return WRAPPER_FACTORY.getCurveLpTokenForWrapper(_asset) != address(0);
    }
}

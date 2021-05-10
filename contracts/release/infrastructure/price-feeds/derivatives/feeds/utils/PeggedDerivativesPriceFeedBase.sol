// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../IDerivativePriceFeed.sol";
import "./SingleUnderlyingDerivativeRegistryMixin.sol";

/// @title PeggedDerivativesPriceFeedBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed base for multiple derivatives that are pegged 1:1 to their underlyings,
/// and have the same decimals as their underlying
abstract contract PeggedDerivativesPriceFeedBase is
    IDerivativePriceFeed,
    SingleUnderlyingDerivativeRegistryMixin
{
    constructor(address _fundDeployer)
        public
        SingleUnderlyingDerivativeRegistryMixin(_fundDeployer)
    {}

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
        address underlying = getUnderlyingForDerivative(_derivative);
        require(underlying != address(0), "calcUnderlyingValues: Not a supported derivative");

        underlyings_ = new address[](1);
        underlyings_[0] = underlying;

        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = _derivativeAmount;

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        return getUnderlyingForDerivative(_asset) != address(0);
    }

    /// @dev Provides validation that the derivative and underlying have the same decimals.
    /// Can be overrode by the inheriting price feed using super() to implement further validation.
    function __validateDerivative(address _derivative, address _underlying)
        internal
        virtual
        override
    {
        require(
            ERC20(_derivative).decimals() == ERC20(_underlying).decimals(),
            "__validateDerivative: Unequal decimals"
        );
    }
}

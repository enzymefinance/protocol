// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC4626} from "openzeppelin-solc-0.8/token/ERC20/extensions/ERC4626.sol";
import {IDerivativePriceFeed} from "../IDerivativePriceFeed.sol";

/// @title ERC4626PriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for ERC4626 vaults
contract ERC4626PriceFeed is IDerivativePriceFeed {
    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        view
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        underlyings_ = new address[](1);
        underlyingAmounts_ = new uint256[](1);

        underlyings_[0] = IERC4626(_derivative).asset();
        underlyingAmounts_[0] = IERC4626(_derivative).convertToAssets({shares: _derivativeAmount});

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        // There isn't a great way to validate that `_asset` is really an ERC4626 vault
        // Since this function only serves to validate the Council's own user inputs,
        // it is sufficient to do a simple, convenient check that the required interface is present.

        return IERC4626(_asset).asset() != address(0);
    }
}

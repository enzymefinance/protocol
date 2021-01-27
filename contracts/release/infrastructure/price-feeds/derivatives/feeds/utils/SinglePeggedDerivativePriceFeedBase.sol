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

/// @title SinglePeggedDerivativePriceFeedBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed base for any single derivative that is pegged 1:1 to its underlying
abstract contract SinglePeggedDerivativePriceFeedBase is IDerivativePriceFeed {
    address private immutable DERIVATIVE;
    address private immutable UNDERLYING;

    constructor(address _derivative, address _underlying) public {
        require(
            ERC20(_derivative).decimals() == ERC20(_underlying).decimals(),
            "constructor: Unequal decimals"
        );

        DERIVATIVE = _derivative;
        UNDERLYING = _underlying;
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
        require(isSupportedAsset(_derivative), "calcUnderlyingValues: Not a supported derivative");

        underlyings_ = new address[](1);
        underlyings_[0] = UNDERLYING;
        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = _derivativeAmount;

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == DERIVATIVE;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `DERIVATIVE` variable value
    /// @return derivative_ The `DERIVATIVE` variable value
    function getDerivative() external view returns (address derivative_) {
        return DERIVATIVE;
    }

    /// @notice Gets the `UNDERLYING` variable value
    /// @return underlying_ The `UNDERLYING` variable value
    function getUnderlying() external view returns (address underlying_) {
        return UNDERLYING;
    }
}

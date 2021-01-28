// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IAlphaHomoraV1Bank.sol";
import "../IDerivativePriceFeed.sol";

/// @title AlphaHomoraV1PriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Alpha Homora v1 ibETH
contract AlphaHomoraV1PriceFeed is IDerivativePriceFeed {
    using SafeMath for uint256;

    address private immutable IBETH_TOKEN;
    address private immutable WETH_TOKEN;

    constructor(address _ibethToken, address _wethToken) public {
        IBETH_TOKEN = _ibethToken;
        WETH_TOKEN = _wethToken;
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
        require(isSupportedAsset(_derivative), "calcUnderlyingValues: Only ibETH is supported");

        underlyings_ = new address[](1);
        underlyings_[0] = WETH_TOKEN;
        underlyingAmounts_ = new uint256[](1);

        IAlphaHomoraV1Bank alphaHomoraBankContract = IAlphaHomoraV1Bank(IBETH_TOKEN);
        underlyingAmounts_[0] = _derivativeAmount.mul(alphaHomoraBankContract.totalETH()).div(
            alphaHomoraBankContract.totalSupply()
        );

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == IBETH_TOKEN;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `IBETH_TOKEN` variable
    /// @return ibethToken_ The `IBETH_TOKEN` variable value
    function getIbethToken() external view returns (address ibethToken_) {
        return IBETH_TOKEN;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}

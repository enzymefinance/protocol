// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {ILidoSteth} from "../../../../../external-interfaces/ILidoSteth.sol";
import {IDerivativePriceFeed} from "../IDerivativePriceFeed.sol";

/// @title WstethPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed for Lido wrapped stETH (wstETH)
contract WstethPriceFeed is IDerivativePriceFeed {
    ILidoSteth private immutable STETH_CONTRACT;
    address private immutable WSTETH;

    constructor(address _wsteth, address _steth) public {
        STETH_CONTRACT = ILidoSteth(_steth);
        WSTETH = _wsteth;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        underlyings_ = new address[](1);
        underlyings_[0] = address(STETH_CONTRACT);

        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = STETH_CONTRACT.getPooledEthByShares(_derivativeAmount);

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == WSTETH;
    }
}

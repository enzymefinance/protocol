// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IEtherFiWrappedEth} from "../../../../../external-interfaces/IEtherFiWrappedEth.sol";
import {IDerivativePriceFeed} from "../IDerivativePriceFeed.sol";

/// @title EtherFiEthPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed for ether.fi ETH (eETH)
contract EtherFiEthPriceFeed is IDerivativePriceFeed {
    IEtherFiWrappedEth private immutable WEETH_CONTRACT;
    address private immutable EETH;

    constructor(address _eeth, address _weeth) public {
        EETH = _eeth;
        WEETH_CONTRACT = IEtherFiWrappedEth(_weeth);
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
        underlyings_[0] = address(WEETH_CONTRACT);

        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = WEETH_CONTRACT.getEETHByWeETH({_weETHAmount: _derivativeAmount});

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == EETH;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IDispatcher} from "../../../../../persistent/dispatcher/IDispatcher.sol";
import {IFundValueCalculatorRouter} from
    "../../../../../persistent/fund-value-calculator/IFundValueCalculatorRouter.sol";
import {IComptroller} from "../../../../core/fund/comptroller/IComptroller.sol";
import {IDerivativePriceFeed} from "../IDerivativePriceFeed.sol";

/// @title EnzymeVaultPriceFeed Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Price source oracle for Enzyme Vault shares
/// This price feed is used to calculate the value of Child Vault shares held by a Parent Vault
/// @dev Supported vaults and their holders must not get into a recursive state where VaultA holds VaultB shares
/// and Vault B holds VaultA shares. The easiest way to prevent this is for supported vaults to never hold shares of other vaults.
contract EnzymeVaultPriceFeed is IDerivativePriceFeed {
    ///@dev Shares unit for the Enzyme Vault
    uint256 private constant SHARES_UNIT = 10 ** 18;

    ///@dev Dispatcher contract, used to get the FundDeployer for a given VaultProxy, and validate whether a VaultProxy is valid
    IDispatcher public immutable DISPATCHER;
    ///@dev FundValueCalculatorRouter contract, used to calculate the net share value of a VaultProxy
    IFundValueCalculatorRouter public immutable FUND_VALUE_CALCULATOR_ROUTER;

    constructor(IDispatcher _dispatcher, IFundValueCalculatorRouter _fundValueCalculatorRouter) {
        DISPATCHER = _dispatcher;
        FUND_VALUE_CALCULATOR_ROUTER = _fundValueCalculatorRouter;
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
        (address denominationAsset, uint256 netShareValue) =
            FUND_VALUE_CALCULATOR_ROUTER.calcNetShareValue({_vaultProxy: _derivative});

        underlyings_ = new address[](1);
        underlyings_[0] = denominationAsset;

        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = _derivativeAmount * netShareValue / SHARES_UNIT;

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) external view returns (bool isSupported_) {
        return DISPATCHER.getFundDeployerForVaultProxy(_asset) != address(0);
    }
}

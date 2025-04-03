// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IERC20} from "../../../external-interfaces/IERC20.sol";
import {IValueInterpreter} from "../../../release/infrastructure/value-interpreter/IValueInterpreter.sol";
import {FundValueCalculatorRouter} from "../../fund-value-calculator/FundValueCalculatorRouter.sol";
import {IValueInterpreterGetter} from "./interfaces/IValueInterpreterGetter.sol";

/// @title FundDataProviderRouter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A peripheral contract for routing fund data requests
/// @dev These are convenience functions intended for off-chain consumption,
/// some of which involve potentially expensive state transitions
/// @dev This contract assumes that the FundValueCalculators for each release contain a getValueInterpreter getter.
/// @dev This currently holds for Enzyme v2, v3 and v4.
contract FundDataProviderRouter {
    address private immutable FUND_VALUE_CALCULATOR_ROUTER;
    address private immutable WETH_TOKEN;

    constructor(address _fundValueCalculatorRouter, address _wethToken) public {
        FUND_VALUE_CALCULATOR_ROUTER = _fundValueCalculatorRouter;
        WETH_TOKEN = _wethToken;
    }

    /// @notice Gets metrics related to fund value
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return timestamp_ The current block timestamp
    /// @return sharesSupply_ The total supply of shares
    /// @return gavInDenominationAsset_ The GAV quoted in the denomination asset
    /// @return gavInEth_ The GAV quoted in ETH
    /// @return gavIsValid_ True if the GAV calc succeeded
    /// @return navInDenominationAsset_ The NAV quoted in the denomination asset
    /// @return navInEth_ The NAV quoted in ETH
    /// @return navIsValid_ True if the NAV calc succeeded
    /// @return ethConversionIsValid_ True if conversion to ETH succeeded
    function getFundValueMetrics(address _vaultProxy)
        external
        returns (
            uint256 timestamp_,
            uint256 sharesSupply_,
            uint256 gavInDenominationAsset_,
            uint256 gavInEth_,
            bool gavIsValid_,
            uint256 navInDenominationAsset_,
            uint256 navInEth_,
            bool navIsValid_,
            bool ethConversionIsValid_
        )
    {
        timestamp_ = block.timestamp;
        sharesSupply_ = IERC20(_vaultProxy).totalSupply();

        address denominationAsset;

        try FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcGav(_vaultProxy) returns (
            address denominationAsset_, uint256 gav_
        ) {
            gavInDenominationAsset_ = gav_;
            denominationAsset = denominationAsset_;
            gavIsValid_ = true;
        } catch {}

        try FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcNav(_vaultProxy) returns (
            address, uint256 nav_
        ) {
            navInDenominationAsset_ = nav_;
            navIsValid_ = true;
        } catch {}

        try IValueInterpreterGetter(
            address(
                FundValueCalculatorRouter(getFundValueCalculatorRouter()).getFundValueCalculatorForVault(_vaultProxy)
            )
        ).getValueInterpreter() returns (address valueInterpreter_) {
            ethConversionIsValid_ = true;
            gavInEth_ = IValueInterpreter(valueInterpreter_).calcCanonicalAssetValue({
                _baseAsset: denominationAsset,
                _amount: gavInDenominationAsset_,
                _quoteAsset: WETH_TOKEN
            });

            navInEth_ = IValueInterpreter(valueInterpreter_).calcCanonicalAssetValue({
                _baseAsset: denominationAsset,
                _amount: navInDenominationAsset_,
                _quoteAsset: WETH_TOKEN
            });
        } catch {}

        return (
            timestamp_,
            sharesSupply_,
            gavInDenominationAsset_,
            gavInEth_,
            gavIsValid_,
            navInDenominationAsset_,
            navInEth_,
            navIsValid_,
            ethConversionIsValid_
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FUND_VALUE_CALCULATOR_ROUTER` variable
    /// @return fundValueCalculatorRouter_ The `FUND_VALUE_CALCULATOR_ROUTER` variable value
    function getFundValueCalculatorRouter() public view returns (address fundValueCalculatorRouter_) {
        return FUND_VALUE_CALCULATOR_ROUTER;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}

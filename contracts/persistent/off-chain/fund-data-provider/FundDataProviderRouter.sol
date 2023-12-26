// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IERC20} from "../../../external-interfaces/IERC20.sol";
import {FundValueCalculatorRouter} from "../fund-value-calculator/FundValueCalculatorRouter.sol";

/// @title FundDataProviderRouter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A peripheral contract for routing fund data requests
/// @dev These are convenience functions intended for off-chain consumption,
/// some of which involve potentially expensive state transitions
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
    /// @return gavInEth_ The GAV quoted in ETH
    /// @return gavIsValid_ True if the GAV calc succeeded
    /// @return navInEth_ The NAV quoted in ETH
    /// @return navIsValid_ True if the NAV calc succeeded
    function getFundValueMetrics(address _vaultProxy)
        external
        returns (
            uint256 timestamp_,
            uint256 sharesSupply_,
            uint256 gavInEth_,
            bool gavIsValid_,
            uint256 navInEth_,
            bool navIsValid_
        )
    {
        timestamp_ = block.timestamp;
        sharesSupply_ = IERC20(_vaultProxy).totalSupply();

        try FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcGavInAsset(_vaultProxy, getWethToken())
        returns (uint256 gav) {
            gavInEth_ = gav;
            gavIsValid_ = true;
        } catch {}

        try FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcNavInAsset(_vaultProxy, getWethToken())
        returns (uint256 nav) {
            navInEth_ = nav;
            navIsValid_ = true;
        } catch {}

        return (timestamp_, sharesSupply_, gavInEth_, gavIsValid_, navInEth_, navIsValid_);
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

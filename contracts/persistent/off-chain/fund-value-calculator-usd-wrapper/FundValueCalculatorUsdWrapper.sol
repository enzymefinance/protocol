// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "../../fund-value-calculator/FundValueCalculatorRouter.sol";

/// @title IChainlinkAggregatorFundValueCalculatorUsdWrapper Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IChainlinkAggregatorFundValueCalculatorUsdWrapper {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @title FundValueCalculatorUsdWrapper Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Wraps the FundValueCalculatorRouter to get fund values with USD as the quote asset
/// @dev USD values are normalized to a precision of 18 decimals.
/// These values should generally only be consumed from off-chain,
/// unless you understand how each release interprets each calculation.
contract FundValueCalculatorUsdWrapper {
    using SafeMath for uint256;

    uint256 private constant ETH_USD_AGGREGATOR_DECIMALS = 8;

    address private immutable ETH_USD_AGGREGATOR;
    address private immutable FUND_VALUE_CALCULATOR_ROUTER;
    uint256 private immutable STALE_RATE_THRESHOLD;
    address private immutable WETH_TOKEN;

    constructor(
        address _fundValueCalculatorRouter,
        address _wethToken,
        address _ethUsdAggregator,
        uint256 _staleRateThreshold
    ) public {
        ETH_USD_AGGREGATOR = _ethUsdAggregator;
        FUND_VALUE_CALCULATOR_ROUTER = _fundValueCalculatorRouter;
        STALE_RATE_THRESHOLD = _staleRateThreshold;
        WETH_TOKEN = _wethToken;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Calculates the GAV for a given fund in USD
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return gav_ The GAV quoted in USD
    function calcGav(address _vaultProxy) external returns (uint256 gav_) {
        uint256 valueInEth =
            FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcGavInAsset(_vaultProxy, getWethToken());

        return __convertEthToUsd(valueInEth);
    }

    /// @notice Calculates the gross value of one shares unit (10 ** 18) for a given fund in USD
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return grossShareValue_ The gross share value quoted in USD
    function calcGrossShareValue(address _vaultProxy) external returns (uint256 grossShareValue_) {
        uint256 valueInEth = FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcGrossShareValueInAsset(
            _vaultProxy, getWethToken()
        );

        return __convertEthToUsd(valueInEth);
    }

    /// @notice Calculates the NAV for a given fund in USD
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return nav_ The NAV quoted in USD
    function calcNav(address _vaultProxy) external returns (uint256 nav_) {
        uint256 valueInEth =
            FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcNavInAsset(_vaultProxy, getWethToken());

        return __convertEthToUsd(valueInEth);
    }

    /// @notice Calculates the net value of one shares unit (10 ** 18) for a given fund in USD
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return netShareValue_ The net share value quoted in USD
    function calcNetShareValue(address _vaultProxy) external returns (uint256 netShareValue_) {
        uint256 valueInEth = FundValueCalculatorRouter(getFundValueCalculatorRouter()).calcNetShareValueInAsset(
            _vaultProxy, getWethToken()
        );

        return __convertEthToUsd(valueInEth);
    }

    /// @notice Calculates the net value of all shares held by a specified account in USD
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _sharesHolder The account holding shares
    /// @return netValue_ The net value of all shares held by _sharesHolder quoted in USD
    function calcNetValueForSharesHolder(address _vaultProxy, address _sharesHolder)
        external
        returns (uint256 netValue_)
    {
        uint256 valueInEth = FundValueCalculatorRouter(getFundValueCalculatorRouter())
            .calcNetValueForSharesHolderInAsset(_vaultProxy, _sharesHolder, getWethToken());

        return __convertEthToUsd(valueInEth);
    }

    /// @dev Helper to convert an ETH amount to USD
    function __convertEthToUsd(uint256 _ethAmount) private view returns (uint256 usdAmount_) {
        (, int256 usdPerEthRate,, uint256 updatedAt,) = getEthUsdAggregatorContract().latestRoundData();
        require(usdPerEthRate > 0, "__convertEthToUsd: Bad ethUsd rate");
        require(updatedAt >= block.timestamp.sub(getStaleRateThreshold()), "__convertEthToUsd: Stale rate detected");

        return _ethAmount.mul(uint256(usdPerEthRate)).div(10 ** ETH_USD_AGGREGATOR_DECIMALS);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ETH_USD_AGGREGATOR` variable value
    /// @return ethUsdAggregatorContract_ The `ETH_USD_AGGREGATOR` variable value
    function getEthUsdAggregatorContract()
        public
        view
        returns (IChainlinkAggregatorFundValueCalculatorUsdWrapper ethUsdAggregatorContract_)
    {
        return IChainlinkAggregatorFundValueCalculatorUsdWrapper(ETH_USD_AGGREGATOR);
    }

    /// @notice Gets the `FUND_VALUE_CALCULATOR_ROUTER` variable
    /// @return fundValueCalculatorRouter_ The `FUND_VALUE_CALCULATOR_ROUTER` variable value
    function getFundValueCalculatorRouter() public view returns (address fundValueCalculatorRouter_) {
        return FUND_VALUE_CALCULATOR_ROUTER;
    }

    /// @notice Gets the `STALE_RATE_THRESHOLD` variable value
    /// @return staleRateThreshold_ The `STALE_RATE_THRESHOLD` value
    function getStaleRateThreshold() public view returns (uint256 staleRateThreshold_) {
        return STALE_RATE_THRESHOLD;
    }

    /// @notice Gets the `WETH_TOKEN` variable value
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() public view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}

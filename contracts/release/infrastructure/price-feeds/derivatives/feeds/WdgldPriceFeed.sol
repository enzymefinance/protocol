// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IChainlinkAggregator.sol";
import "../../../../utils/MakerDaoMath.sol";
import "../IDerivativePriceFeed.sol";

/// @title WdgldPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for WDGLD <https://dgld.ch/>
contract WdgldPriceFeed is IDerivativePriceFeed, MakerDaoMath {
    using SafeMath for uint256;

    address private immutable XAU_AGGREGATOR;
    address private immutable ETH_AGGREGATOR;

    address private immutable WDGLD;
    address private immutable WETH;

    // GTR_CONSTANT aggregates all the invariants in the GTR formula to save gas
    uint256 private constant GTR_CONSTANT = 999990821653213975346065101;
    uint256 private constant GTR_PRECISION = 10**27;
    uint256 private constant WDGLD_GENESIS_TIMESTAMP = 1568700000;

    constructor(
        address _wdgld,
        address _weth,
        address _ethAggregator,
        address _xauAggregator
    ) public {
        WDGLD = _wdgld;
        WETH = _weth;
        ETH_AGGREGATOR = _ethAggregator;
        XAU_AGGREGATOR = _xauAggregator;
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
        require(isSupportedAsset(_derivative), "calcUnderlyingValues: Only WDGLD is supported");

        underlyings_ = new address[](1);
        underlyings_[0] = WETH;
        underlyingAmounts_ = new uint256[](1);

        // Get price rates from xau and eth aggregators
        int256 xauToUsdRate = IChainlinkAggregator(XAU_AGGREGATOR).latestAnswer();
        int256 ethToUsdRate = IChainlinkAggregator(ETH_AGGREGATOR).latestAnswer();
        require(xauToUsdRate > 0 && ethToUsdRate > 0, "calcUnderlyingValues: rate invalid");

        uint256 wdgldToXauRate = calcWdgldToXauRate();

        // 10**17 is a combination of ETH_UNIT / WDGLD_UNIT * GTR_PRECISION
        underlyingAmounts_[0] = _derivativeAmount
            .mul(wdgldToXauRate)
            .mul(uint256(xauToUsdRate))
            .div(uint256(ethToUsdRate))
            .div(10**17);

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Calculates the rate of WDGLD to XAU.
    /// @return wdgldToXauRate_ The current rate of WDGLD to XAU
    /// @dev Full formula available <https://dgld.ch/assets/documents/dgld-whitepaper.pdf>
    function calcWdgldToXauRate() public view returns (uint256 wdgldToXauRate_) {
        return
            __rpow(
                GTR_CONSTANT,
                ((block.timestamp).sub(WDGLD_GENESIS_TIMESTAMP)).div(28800), // 60 * 60 * 8 (8 hour periods)
                GTR_PRECISION
            )
                .div(10);
    }

    /// @notice Checks if an asset is supported by this price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return _asset == WDGLD;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ETH_AGGREGATOR` address
    /// @return ethAggregatorAddress_ The `ETH_AGGREGATOR` address
    function getEthAggregator() external view returns (address ethAggregatorAddress_) {
        return ETH_AGGREGATOR;
    }

    /// @notice Gets the `WDGLD` token address
    /// @return wdgld_ The `WDGLD` token address
    function getWdgld() external view returns (address wdgld_) {
        return WDGLD;
    }

    /// @notice Gets the `WETH` token address
    /// @return weth_ The `WETH` token address
    function getWeth() external view returns (address weth_) {
        return WETH;
    }

    /// @notice Gets the `XAU_AGGREGATOR` address
    /// @return xauAggregatorAddress_ The `XAU_AGGREGATOR` address
    function getXauAggregator() external view returns (address xauAggregatorAddress_) {
        return XAU_AGGREGATOR;
    }
}

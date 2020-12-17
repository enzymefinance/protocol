// SPDX-License-Identifier: GPL-3.0
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

    uint256 private constant WDGLD_GENESIS_TIMESTAMP = 1568700000;
    uint256 private constant GTR_PRECISION = 10**27;

    // GTR_CONSTANT aggregates all the invariants in the GTR formula to save gas
    uint256 private constant GTR_CONSTANT = 999990821653213974934379777;

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

    /// @notice Gets the rates for 1 unit of the derivative to its underlying assets
    /// @param _derivative The derivative for which to get the rates
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return rates_ The rates for the _derivative to the underlyings_
    /// @dev Given that this derivative doesn't have a primitive underlying, the rate is referenced in weth
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        require(isSupportedAsset(_derivative), "getRatesToUnderlyings: Only WDGLD is supported");

        underlyings_ = new address[](1);
        underlyings_[0] = WETH;
        rates_ = new uint256[](1);

        // wdgld to xau rate. Full formula available <https://dgld.ch/assets/documents/dgld-whitepaper.pdf>
        uint256 wdgldToXauRate = __rpow(
            GTR_CONSTANT,
            ((block.timestamp).sub(WDGLD_GENESIS_TIMESTAMP)).div(28800), // 60 * 60 * 8 (8 hour periods)
            GTR_PRECISION
        )
            .div(10);
        // Get price rates from xau and eth aggregators
        int256 xauToUsdRate = IChainlinkAggregator(XAU_AGGREGATOR).latestAnswer();
        int256 ethToUsdRate = IChainlinkAggregator(ETH_AGGREGATOR).latestAnswer();
        require(xauToUsdRate > 0 && ethToUsdRate > 0, "getRatesToUnderlyings: rate invalid");

        // Calculate xau to weth rate (xau calculated as a 8 decimal token)
        uint256 xauToWeth = uint256(xauToUsdRate).mul(10**18).div(uint256(ethToUsdRate));

        // Calculate wdgld to WETH from previous rates
        rates_[0] = wdgldToXauRate.mul(xauToWeth).div(GTR_PRECISION);
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

    /// @notice Gets the `GTR_CONSTANT` value
    /// @return gtrConstant_ The `GTR_CONSTANT` value
    function getGtrConstant() external pure returns (uint256 gtrConstant_) {
        return GTR_CONSTANT;
    }

    /// @notice Gets the `WDGLD` token address
    /// @return wdgld_ The `WDGLD` token address
    function getWdgld() external view returns (address wdgld_) {
        return WDGLD;
    }

    /// @notice Gets the `WDGLD_GENESIS_TIMESTAMP` value
    /// @return getWdgldGenesisTimestamp_ The `WDGLD_GENESIS_TIMESTAMP` value
    function getWdgldGenesisTimestamp() external pure returns (uint256 getWdgldGenesisTimestamp_) {
        return WDGLD_GENESIS_TIMESTAMP;
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

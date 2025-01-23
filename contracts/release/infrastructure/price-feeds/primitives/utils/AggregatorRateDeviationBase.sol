// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {PriceFeedHelpersLib} from "../../utils/PriceFeedHelpersLib.sol";
import {RateAggregatorBase} from "./RateAggregatorBase.sol";

/// @title AggregatorRateDeviationBase Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Aggregator base contract to select an ideal rate or an aggregator source rate according to deviation
abstract contract AggregatorRateDeviationBase is RateAggregatorBase {
    // Immutables: deployer-input
    /// @dev `MARKET_AGGREGATOR_ADDRESS`: the aggregator used as the "market rate"
    address public immutable MARKET_AGGREGATOR_ADDRESS;
    /// @dev `DEVIATION_TOLERANCE_BPS`: the relative tolerance (in bps) of the difference
    /// between "market rate" and "ideal rate"
    uint256 public immutable DEVIATION_TOLERANCE_BPS;
    // Immutables: derived
    /// @dev `MARKET_AGGREGATOR_PRECISION`: the precision of `MARKET_AGGREGATOR_ADDRESS`
    uint256 private immutable MARKET_AGGREGATOR_PRECISION;

    constructor(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    )
        RateAggregatorBase(_thisAggregatorDecimals, _quoteConversionAggregatorAddress, _quoteConversionAggregatorInverted)
    {
        DEVIATION_TOLERANCE_BPS = _deviationToleranceBps;
        MARKET_AGGREGATOR_ADDRESS = _marketAggregatorAddress;

        MARKET_AGGREGATOR_PRECISION =
            PriceFeedHelpersLib.parsePrecisionFromChainlinkAggregator(_marketAggregatorAddress);
    }

    //==================================================================================================================
    // Required virtual function declarations
    //==================================================================================================================

    /// @notice Returns the ideal rate that will be compared with the market aggregator rate
    /// @return rate_ The ideal rate
    /// @return ratePrecision_ The ideal rate's precision
    /// @return timestamp_ The ideal rate's timestamp
    function idealRate() public view virtual returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_);

    //==================================================================================================================
    // Required overrides: RateAggregatorBase
    //==================================================================================================================

    /// @inheritdoc RateAggregatorBase
    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        (rate_, ratePrecision_, timestamp_) = idealRate();

        return
            __rateByDeviation({_idealRate: rate_, _idealRatePrecision: ratePrecision_, _idealRateTimestamp: timestamp_});
    }

    //==================================================================================================================
    // Helpers
    //==================================================================================================================

    /// @dev Selects between ideal and aggregator rates.
    /// - rate: The ideal rate is selected unless the aggregator rate deviates from it by more than the relative tolerance,
    /// in which case the aggregator rate will be selected.
    /// - timestamp: The oldest timestamp of the two rates is always selected.
    function __rateByDeviation(uint256 _idealRate, uint256 _idealRatePrecision, uint256 _idealRateTimestamp)
        private
        view
        returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_)
    {
        // Fetch raw market rate
        (uint256 marketRate, uint256 marketRateTimestamp) =
            PriceFeedHelpersLib.parseRateFromChainlinkAggregator(MARKET_AGGREGATOR_ADDRESS);

        // Scale the market rate to the precision of the ideal rate
        ratePrecision_ = _idealRatePrecision;
        marketRate = PriceFeedHelpersLib.convertRatePrecision({
            _rate: marketRate,
            _fromPrecision: MARKET_AGGREGATOR_PRECISION,
            _toPrecision: ratePrecision_
        });

        // Select the rate based on deviation tolerance
        rate_ = PriceFeedHelpersLib.selectRateByToleranceDeviation({
            _idealRate: _idealRate,
            _marketRate: marketRate,
            _deviationToleranceBps: DEVIATION_TOLERANCE_BPS
        });

        // Select the oldest timestamp
        timestamp_ = PriceFeedHelpersLib.selectOldestTimestamp(_idealRateTimestamp, marketRateTimestamp);
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IChainlinkAggregator} from "../../../../../external-interfaces/IChainlinkAggregator.sol";
import {PriceFeedHelpersLib} from "../../utils/PriceFeedHelpersLib.sol";

/// @title RateAggregatorBase Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Base contract for Chainlink-like aggregators
abstract contract RateAggregatorBase is IChainlinkAggregator {
    /// @dev `INVERTED_RATE_PRECISION`: the intermediary precision used when converting a rate via an inverse rate
    uint256 internal constant INVERTED_RATE_PRECISION = 10 ** 27;

    // Immutables: deployer-input
    /// @dev `DECIMALS`: the decimals() output of this aggregator
    uint8 public immutable DECIMALS;
    /// @dev `QUOTE_CONVERSION_AGGREGATOR_ADDRESS`: (optional) the aggregator for converting the rate to a new quote
    address public immutable QUOTE_CONVERSION_AGGREGATOR_ADDRESS;
    /// @dev `QUOTE_CONVERSION_AGGREGATOR_INVERTED`: (optional) true if `QUOTE_CONVERSION_AGGREGATOR_ADDRESS` is an
    /// inverse of the desired conversion aggregator (e.g., BTC/ETH instead of ETH/BTC)
    bool public immutable QUOTE_CONVERSION_AGGREGATOR_INVERTED;

    // Immutables: derived
    /// @dev `PRECISION`: the precision of this aggregator's `answer` value in `latestRoundData()`
    uint256 internal immutable PRECISION;
    /// @dev `QUOTE_CONVERSION_AGGREGATOR_PRECISION`: the precision of `QUOTE_CONVERSION_AGGREGATOR_ADDRESS`
    uint256 internal immutable QUOTE_CONVERSION_AGGREGATOR_PRECISION;

    constructor(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted
    ) {
        DECIMALS = _thisAggregatorDecimals;
        PRECISION = 10 ** _thisAggregatorDecimals;
        QUOTE_CONVERSION_AGGREGATOR_ADDRESS = _quoteConversionAggregatorAddress;
        QUOTE_CONVERSION_AGGREGATOR_INVERTED = _quoteConversionAggregatorInverted;
        QUOTE_CONVERSION_AGGREGATOR_PRECISION = _quoteConversionAggregatorAddress != address(0)
            ? PriceFeedHelpersLib.parsePrecisionFromChainlinkAggregator(_quoteConversionAggregatorAddress)
            : 0;
    }

    //==================================================================================================================
    // Required virtual function declarations
    //==================================================================================================================

    /// @notice Returns the base rate for the aggregator, prior to quote asset and precision conversions
    /// @return rate_ The base rate
    /// @return ratePrecision_ The base rate's precision
    /// @return timestamp_ The base rate's timestamp
    function baseRate() public view virtual returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_);

    //==================================================================================================================
    // Required overrides: IChainlinkAggregator
    //==================================================================================================================

    /// @notice The number of precision decimals in the aggregator answer
    /// @return decimals_ The number of decimals
    function decimals() public view override returns (uint8 decimals_) {
        return DECIMALS;
    }

    /// @notice Returns the final converted rate data
    /// @return roundId_ Unused
    /// @return answer_ The rate
    /// @return startedAt_ Unused
    /// @return updatedAt_ The timestamp
    /// @return answeredInRound_ Unused
    /// @dev Only includes the return values that are required by Enzyme v4
    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        // 1. Get the base rate from inheriting contract
        (uint256 rate, uint256 ratePrecision, uint256 timestamp) = baseRate();

        // 2. If needed, convert to a new quote asset via a 2nd aggregator
        if (QUOTE_CONVERSION_AGGREGATOR_ADDRESS != address(0)) {
            (uint256 quoteRate, uint256 quoteRateTimestamp) =
                PriceFeedHelpersLib.parseRateFromChainlinkAggregator(QUOTE_CONVERSION_AGGREGATOR_ADDRESS);

            uint256 quoteRatePrecision;
            if (QUOTE_CONVERSION_AGGREGATOR_INVERTED) {
                quoteRate = PriceFeedHelpersLib.invertRate({
                    _rate: quoteRate,
                    _ratePrecision: QUOTE_CONVERSION_AGGREGATOR_PRECISION,
                    _toPrecision: INVERTED_RATE_PRECISION
                });
                quoteRatePrecision = INVERTED_RATE_PRECISION;
            } else {
                quoteRatePrecision = QUOTE_CONVERSION_AGGREGATOR_PRECISION;
            }

            rate = PriceFeedHelpersLib.convertRateToNewQuoteAsset({
                _baseRate: rate,
                _baseRatePrecision: ratePrecision,
                _quoteRate: quoteRate
            });
            ratePrecision = quoteRatePrecision;
            timestamp = PriceFeedHelpersLib.selectOldestTimestamp(timestamp, quoteRateTimestamp);
        }

        // 3. If needed, scale the rate to this aggregator's precision
        rate = PriceFeedHelpersLib.convertRatePrecision({
            _rate: rate,
            _fromPrecision: ratePrecision,
            _toPrecision: PRECISION
        });

        // 4. Return the final rate and timestamp in Chainlink format
        return PriceFeedHelpersLib.formatRateAsChainlinkAggregator({_rate: rate, _timestamp: timestamp});
    }
}

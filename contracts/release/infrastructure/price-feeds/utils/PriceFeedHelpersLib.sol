// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IChainlinkAggregator} from "../../../../external-interfaces/IChainlinkAggregator.sol";

/// @title PriceFeedHelpersLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Library with common helper functions for price feeds
library PriceFeedHelpersLib {
    /// @dev `BPS_MAX`: 100% in bps
    uint256 internal constant BPS_MAX = 10_000;

    /// @notice Thrown during parseRateFromChainlinkAggregator() when the aggregator answer is a negative number
    error PriceFeedHelpersLib__ParseRateFromChainlinkAggregator__NegativeAnswer(int256 answer);

    /// @dev Converts a rate to a new precision
    function convertRatePrecision(uint256 _rate, uint256 _fromPrecision, uint256 _toPrecision)
        internal
        pure
        returns (uint256 convertedRate_)
    {
        if (_fromPrecision == _toPrecision) {
            return _rate;
        }

        return (_rate * _toPrecision) / _fromPrecision;
    }

    /// @dev Converts a rate to a new quote asset using rule of three (e.g., ETH/BTC to ETH/USD using BTC/USD as intermediary)
    function convertRateToNewQuoteAsset(uint256 _baseRate, uint256 _baseRatePrecision, uint256 _quoteRate)
        internal
        pure
        returns (uint256 convertedRate_)
    {
        return _baseRate * _quoteRate / _baseRatePrecision;
    }

    /// @dev Formats rate with timestamp into the return values shape of Chainlink-like latestRoundData()
    function formatRateAsChainlinkAggregator(uint256 _rate, uint256 _timestamp)
        internal
        pure
        returns (uint80, int256 answer_, uint256, uint256 updatedAt_, uint80)
    {
        answer_ = int256(_rate);
        updatedAt_ = _timestamp;

        return (0, answer_, 0, updatedAt_, 0);
    }

    /// @dev Inverts a rate (e.g., ETH/BTC to BTC/ETH)
    function invertRate(uint256 _rate, uint256 _ratePrecision, uint256 _toPrecision)
        internal
        pure
        returns (uint256 convertedRate_)
    {
        return _toPrecision * _ratePrecision / _rate;
    }

    /// @dev Parses the precision of a given Chainlink-like aggregator (i.e., 10 ** decimals)
    function parsePrecisionFromChainlinkAggregator(address _aggregatorAddress)
        internal
        view
        returns (uint256 precision_)
    {
        return 10 ** IChainlinkAggregator(_aggregatorAddress).decimals();
    }

    /// @dev Parses rate with timestamp from the latest round of a given Chainlink-like aggregator
    function parseRateFromChainlinkAggregator(address _aggregatorAddress)
        internal
        view
        returns (uint256 rate_, uint256 timestamp_)
    {
        int256 answer;
        (, answer,, timestamp_,) = IChainlinkAggregator(_aggregatorAddress).latestRoundData();

        if (answer < 0) {
            revert PriceFeedHelpersLib__ParseRateFromChainlinkAggregator__NegativeAnswer(answer);
        }

        rate_ = uint256(answer);
    }

    /// @dev Selects the oldest of two timestamps
    function selectOldestTimestamp(uint256 _timestampA, uint256 _timestampB)
        internal
        pure
        returns (uint256 oldestTimestamp_)
    {
        return Math.min(_timestampA, _timestampB);
    }

    /// @dev Selects between an ideal rate and a market rate.
    /// The ideal rate is selected unless the market rate deviates from it by more than the relative tolerance,
    /// in which case the market rate will be selected.
    function selectRateByToleranceDeviation(uint256 _idealRate, uint256 _marketRate, uint256 _deviationToleranceBps)
        internal
        pure
        returns (uint256 selectedRate_)
    {
        uint256 absDeviation = _idealRate > _marketRate ? _idealRate - _marketRate : _marketRate - _idealRate;
        uint256 bpsDeviation = BPS_MAX * absDeviation / _idealRate;

        selectedRate_ = bpsDeviation > _deviationToleranceBps ? _marketRate : _idealRate;
    }
}

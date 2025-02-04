// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {PriceFeedHelpersLib} from "../release/infrastructure/price-feeds/utils/PriceFeedHelpersLib.sol";

/// @title PriceFeedHelpersLibHarness Contract
/// @author Enzyme Foundation <security@enzyme.finance>
contract PriceFeedHelpersLibHarness {
    function exposed_convertRatePrecision(uint256 _rate, uint256 _fromPrecision, uint256 _toPrecision)
        external
        pure
        returns (uint256 convertedRate_)
    {
        return PriceFeedHelpersLib.convertRatePrecision(_rate, _fromPrecision, _toPrecision);
    }

    function exposed_convertRateToNewQuoteAsset(uint256 _baseRate, uint256 _baseRatePrecision, uint256 _quoteRate)
        external
        pure
        returns (uint256 convertedRate_)
    {
        return PriceFeedHelpersLib.convertRateToNewQuoteAsset(_baseRate, _baseRatePrecision, _quoteRate);
    }

    function exposed_formatRateAsChainlinkAggregator(uint256 _rate, uint256 _timestamp)
        external
        pure
        returns (uint80, int256 answer_, uint256, uint256 updatedAt_, uint80)
    {
        return PriceFeedHelpersLib.formatRateAsChainlinkAggregator(_rate, _timestamp);
    }

    function exposed_invertRate(uint256 _rate, uint256 _ratePrecision, uint256 _toPrecision)
        external
        pure
        returns (uint256 convertedRate_)
    {
        return PriceFeedHelpersLib.invertRate(_rate, _ratePrecision, _toPrecision);
    }

    function exposed_parsePrecisionFromChainlinkAggregator(address _aggregatorAddress)
        external
        view
        returns (uint256 precision_)
    {
        return PriceFeedHelpersLib.parsePrecisionFromChainlinkAggregator(_aggregatorAddress);
    }

    function exposed_parseRateFromChainlinkAggregator(address _aggregatorAddress)
        external
        view
        returns (uint256 rate_, uint256 timestamp_)
    {
        return PriceFeedHelpersLib.parseRateFromChainlinkAggregator(_aggregatorAddress);
    }

    function exposed_selectOldestTimestamp(uint256 _timestampA, uint256 _timestampB)
        external
        pure
        returns (uint256 oldestTimestamp_)
    {
        return PriceFeedHelpersLib.selectOldestTimestamp(_timestampA, _timestampB);
    }

    function exposed_selectRateByToleranceDeviation(
        uint256 _idealRate,
        uint256 _marketRate,
        uint256 _deviationToleranceBps
    ) external pure returns (uint256 selectedRate_) {
        return PriceFeedHelpersLib.selectRateByToleranceDeviation(_idealRate, _marketRate, _deviationToleranceBps);
    }
}

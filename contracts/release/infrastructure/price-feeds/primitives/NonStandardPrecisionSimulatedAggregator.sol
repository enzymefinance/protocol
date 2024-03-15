// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IChainlinkAggregator} from "../../../../external-interfaces/IChainlinkAggregator.sol";
import {IChainlinkPriceFeedMixin} from "./IChainlinkPriceFeedMixin.sol";

/// @title NonStandardPrecisionSimulatedAggregator Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A simulated aggregator to support a Chainlink-like aggregator that uses
/// a non-standard number of decimals for precision
contract NonStandardPrecisionSimulatedAggregator {
    enum ScaleType {
        Up,
        Down
    }

    error NegativeAnswer();

    error NoScalingNeeded();

    error UnsupportedRateAsset();

    uint8 private constant STANDARD_ETH_RATE_DECIMALS = 18;
    uint8 private constant STANDARD_USD_RATE_DECIMALS = 8;

    IChainlinkAggregator private immutable AGGREGATOR;
    int256 private immutable SCALE_FACTOR;
    ScaleType private immutable SCALE_TYPE;
    uint8 private immutable STANDARD_RATE_DECIMALS;

    constructor(IChainlinkAggregator _aggregator, IChainlinkPriceFeedMixin.RateAsset _rateAsset) {
        AGGREGATOR = _aggregator;

        // Set the usual decimal precision used for Chainlink feeds of the given rate asset
        uint8 standardRateDecimals;
        if (_rateAsset == IChainlinkPriceFeedMixin.RateAsset.ETH) {
            standardRateDecimals = STANDARD_ETH_RATE_DECIMALS;
        } else if (_rateAsset == IChainlinkPriceFeedMixin.RateAsset.USD) {
            standardRateDecimals = STANDARD_USD_RATE_DECIMALS;
        } else {
            revert UnsupportedRateAsset();
        }
        STANDARD_RATE_DECIMALS = standardRateDecimals;

        // Set the scale type and factor to convert to the standard rate precision,
        // given the actual aggregator's decimal precision
        uint256 scaleFactorUint;
        ScaleType scaleType;
        uint8 aggregatorDecimals = _aggregator.decimals();
        if (aggregatorDecimals > standardRateDecimals) {
            scaleType = ScaleType.Down;
            scaleFactorUint = 10 ** (aggregatorDecimals - standardRateDecimals);
        } else if (aggregatorDecimals < standardRateDecimals) {
            scaleType = ScaleType.Up;
            scaleFactorUint = 10 ** (standardRateDecimals - aggregatorDecimals);
        } else {
            revert NoScalingNeeded();
        }
        SCALE_FACTOR = int256(scaleFactorUint);
        SCALE_TYPE = scaleType;
    }

    /// @notice The decimals used for rate precision of this simulated aggregator
    /// @return decimals_ The number of decimals
    function decimals() external view returns (uint8 decimals_) {
        return STANDARD_RATE_DECIMALS;
    }

    /// @notice The latest round data for this simulated aggregator
    /// @return roundId_ The `roundId` value returned by the Chainlink aggregator
    /// @return answer_ The `answer` value returned by the Chainlink aggregator, converted to standard rate decimals
    /// @return startedAt_ The `startedAt` value returned by the Chainlink aggregator
    /// @return updatedAt_ The `updatedAt` value returned by the Chainlink aggregator
    /// @return answeredInRound_ The `answeredInRound` value returned by the Chainlink aggregator
    /// @dev All values are returned directly from the target Chainlink-like aggregator,
    /// other than `answer_`, which is converted to the standard decimal precision for the rate asset
    /// and is given the local precision of `DECIMALS`.
    function latestRoundData()
        external
        view
        returns (uint80 roundId_, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80 answeredInRound_)
    {
        int256 aggregatorAnswer;
        (roundId_, aggregatorAnswer, startedAt_, updatedAt_, answeredInRound_) = AGGREGATOR.latestRoundData();

        if (aggregatorAnswer < 0) {
            revert NegativeAnswer();
        }

        if (SCALE_TYPE == ScaleType.Up) {
            answer_ = aggregatorAnswer * SCALE_FACTOR;
        } else {
            answer_ = aggregatorAnswer / SCALE_FACTOR;
        }

        return (roundId_, answer_, startedAt_, updatedAt_, answeredInRound_);
    }
}

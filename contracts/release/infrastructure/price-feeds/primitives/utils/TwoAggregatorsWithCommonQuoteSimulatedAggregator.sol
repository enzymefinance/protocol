// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IChainlinkAggregator} from "../../../../../external-interfaces/IChainlinkAggregator.sol";

/// @title TwoAggregatorsWithCommonQuoteSimulatedAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A simulated aggregator reporting the rate between two base assets of two Chainlink-like aggregators
/// that share the same quote asset. e.g., Aggregators for mln/btc and eth/btc are combined to return mln/eth.
contract TwoAggregatorsWithCommonQuoteSimulatedAggregator is IChainlinkAggregator {
    IChainlinkAggregator public immutable BASE_ASSET_AGGREGATOR; // e.g., mln/btc
    IChainlinkAggregator public immutable QUOTE_ASSET_AGGREGATOR; // e.g., eth/btc
    uint8 public immutable PRECISION_DECIMALS;
    // `CONVERSION_FACTOR`:
    // full formula: (target precision * quote aggregator precision * base aggregator rate) / (quote aggregator rate * base aggregator precision)
    // => (target precision * quote aggregator precision / base aggregator precision) * (base aggregator rate / quote aggregator rate)
    // => CONVERSION_FACTOR * (base aggregator rate / quote aggregator rate)
    int256 private immutable CONVERSION_FACTOR;

    error TwoAggregatorsWithCommonQuoteSimulatedAggregator__NegativeNewBaseAnswer();
    error TwoAggregatorsWithCommonQuoteSimulatedAggregator__NegativeNewQuoteAnswer();

    constructor(address _baseAssetAggregatorAddress, address _quoteAssetAggregatorAddress, uint8 _precisionDecimals) {
        BASE_ASSET_AGGREGATOR = IChainlinkAggregator(_baseAssetAggregatorAddress);
        QUOTE_ASSET_AGGREGATOR = IChainlinkAggregator(_quoteAssetAggregatorAddress);
        PRECISION_DECIMALS = _precisionDecimals;

        CONVERSION_FACTOR =
            int256(10 ** (PRECISION_DECIMALS + QUOTE_ASSET_AGGREGATOR.decimals() - BASE_ASSET_AGGREGATOR.decimals()));
    }

    /// @notice The number of precision decimals in the aggregator answer
    /// @return decimals_ The number of decimals
    function decimals() external view override returns (uint8 decimals_) {
        return PRECISION_DECIMALS;
    }

    /// @notice Returns Chainlink-like latest round data for the base asset in the new quote asset
    /// @return roundId_ Unused
    /// @return answer_ The price of the base asset
    /// @return startedAt_ Unused
    /// @return updatedAt_ The older `updatedAt_` value of the two source aggregators
    /// @return answeredInRound_ Unused
    /// @dev Only includes the return values that are required by Enzyme v4
    function latestRoundData()
        external
        view
        override
        returns (uint80, int256 answer_, uint256, uint256 updatedAt_, uint80)
    {
        int256 baseAssetAnswer;
        uint256 baseAssetUpdatedAt;
        (, baseAssetAnswer,, baseAssetUpdatedAt,) = BASE_ASSET_AGGREGATOR.latestRoundData();

        if (baseAssetAnswer < 0) {
            revert TwoAggregatorsWithCommonQuoteSimulatedAggregator__NegativeNewBaseAnswer();
        }

        int256 quoteAssetAnswer;
        uint256 quoteAssetUpdatedAt;
        (, quoteAssetAnswer,, quoteAssetUpdatedAt,) = QUOTE_ASSET_AGGREGATOR.latestRoundData();

        if (quoteAssetAnswer < 0) {
            revert TwoAggregatorsWithCommonQuoteSimulatedAggregator__NegativeNewQuoteAnswer();
        }

        // Combined rate
        answer_ = CONVERSION_FACTOR * baseAssetAnswer / quoteAssetAnswer;

        // Use the oldest of the two update times
        updatedAt_ = Math.min(baseAssetUpdatedAt, quoteAssetUpdatedAt);

        return (uint80(0), answer_, 0, updatedAt_, uint80(0));
    }
}

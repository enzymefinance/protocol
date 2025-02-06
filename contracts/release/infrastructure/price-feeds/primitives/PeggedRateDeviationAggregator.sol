// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {AggregatorRateDeviationBase} from "./utils/AggregatorRateDeviationBase.sol";

/// @title PeggedRateDeviationAggregator Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Aggregator that selects rate based on source aggregator deviation from an ideal rate of "1"
/// @dev Returns either:
/// (a) the ideal rate of "1" (i.e., pegged)
/// (b) the rate from the market aggregator
contract PeggedRateDeviationAggregator is AggregatorRateDeviationBase {
    constructor(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    )
        AggregatorRateDeviationBase(
            _thisAggregatorDecimals,
            _quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted,
            _marketAggregatorAddress,
            _deviationToleranceBps
        )
    {}

    //==================================================================================================================
    // Required overrides: AggregatorRateDeviationBase
    //==================================================================================================================

    /// @inheritdoc AggregatorRateDeviationBase
    /// @dev Rate is in this aggregator's precision
    function idealRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        rate_ = PRECISION;
        ratePrecision_ = PRECISION;
        timestamp_ = block.timestamp;
    }
}

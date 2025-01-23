// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {AggregatorRateDeviationBase} from
    "../release/infrastructure/price-feeds/primitives/utils/AggregatorRateDeviationBase.sol";

/// @title AggregatorRateDeviationBaseHarness Contract
/// @author Enzyme Foundation <security@enzyme.finance>
contract AggregatorRateDeviationBaseHarness is AggregatorRateDeviationBase {
    uint256 public idealRateStored;
    uint256 public idealRatePrecision;
    uint256 public idealRateTimestamp;

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

    function idealRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        return (idealRateStored, idealRatePrecision, idealRateTimestamp);
    }

    function setIdealRate(uint256 _rate) external {
        idealRateStored = _rate;
    }

    function setIdealRatePrecision(uint256 _ratePrecision) external {
        idealRatePrecision = _ratePrecision;
    }

    function setIdealRateTimestamp(uint256 _timestamp) external {
        idealRateTimestamp = _timestamp;
    }
}

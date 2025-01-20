// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {RateAggregatorBase} from "../release/infrastructure/price-feeds/primitives/utils/RateAggregatorBase.sol";

/// @title RateAggregatorBaseHarness Contract
/// @author Enzyme Foundation <security@enzyme.finance>
contract RateAggregatorBaseHarness is RateAggregatorBase {
    uint256 public rate;
    uint256 public ratePrecision;
    uint256 public timestamp;

    constructor(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted
    )
        RateAggregatorBase(_thisAggregatorDecimals, _quoteConversionAggregatorAddress, _quoteConversionAggregatorInverted)
    {}

    function baseRate() public view override returns (uint256 rate_, uint256 ratePrecision_, uint256 timestamp_) {
        return (rate, ratePrecision, timestamp);
    }

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    function setRatePrecision(uint256 _ratePrecision) external {
        ratePrecision = _ratePrecision;
    }

    function setTimestamp(uint256 _timestamp) external {
        timestamp = _timestamp;
    }
}

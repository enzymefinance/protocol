// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";

import {UnitTest} from "tests/bases/UnitTest.sol";

import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IAggregatorRateDeviationMixinHarness} from "tests/interfaces/internal/IAggregatorRateDeviationMixinHarness.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

contract AggregatorRateDeviationMixinTest is UnitTest {
    // Arbitrary settings
    uint256 deviationToleranceBps = BPS_ONE_PERCENT * 10; // 10%
    uint8 marketAggregatorDecimals = 12;
    uint256 olderTimestamp = 1122;
    uint256 newerTimestamp = olderTimestamp + 3;

    IAggregatorRateDeviationMixinHarness aggregatorRateDeviationMixin;
    TestChainlinkAggregator marketAggregator;

    function setUp() public {
        marketAggregator = new TestChainlinkAggregator(marketAggregatorDecimals);

        aggregatorRateDeviationMixin = IAggregatorRateDeviationMixinHarness(
            deployCode("AggregatorRateDeviationMixinHarness.sol", abi.encode(marketAggregator, deviationToleranceBps))
        );
    }

    // TESTS

    function __test_rateByDeviation_success(
        uint256 _idealRateTimestamp,
        uint256 _marketAggregatorTimestamp,
        bool _exceedsTolerance
    ) internal {
        // use different decimals for ideal and market rates
        uint8 idealRateDecimals = marketAggregatorDecimals - 3;

        uint256 idealRatePrecision = 10 ** idealRateDecimals;
        uint256 marketRatePrecision = 10 ** marketAggregatorDecimals;

        uint256 idealRate = 123 * idealRatePrecision;

        // Calculate the deviation to apply to market rate
        uint256 marketRate;
        {
            uint256 relDeviation = _exceedsTolerance ? deviationToleranceBps + 1 : deviationToleranceBps - 1;
            uint256 absDeviation = idealRate * relDeviation / BPS_ONE_HUNDRED_PERCENT;
            // Set market rate as ideal rate + deviation, in the precision of market rate
            marketRate = (idealRate + absDeviation) * marketRatePrecision / idealRatePrecision;
        }

        marketAggregator.setPrice(marketRate);
        marketAggregator.setTimestamp(_marketAggregatorTimestamp);

        (uint256 rate, uint256 ratePrecision, uint256 timestamp) = aggregatorRateDeviationMixin.exposed_rateByDeviation({
            _idealRate: idealRate,
            _idealRatePrecision: idealRatePrecision,
            _idealRateTimestamp: _idealRateTimestamp
        });

        // Calculate the expected rate (in idealRate's precision)
        uint256 expectedRate = _exceedsTolerance ? marketRate * idealRatePrecision / marketRatePrecision : idealRate;

        assertEq(rate, expectedRate, "Incorrect rate");
        // Precision is always in idealRate's precision
        assertEq(ratePrecision, idealRatePrecision, "Incorrect ratePrecision");
        assertEq(timestamp, Math.min(_idealRateTimestamp, _marketAggregatorTimestamp), "Incorrect timestamp");
    }

    function test_rateByDeviation_successExceedsToleranceAndOlderMarketRate() public {
        __test_rateByDeviation_success({
            _idealRateTimestamp: newerTimestamp,
            _marketAggregatorTimestamp: olderTimestamp,
            _exceedsTolerance: true
        });
    }

    function test_rateByDeviation_successWithinToleranceAndOlderIdealRate() public {
        __test_rateByDeviation_success({
            _idealRateTimestamp: olderTimestamp,
            _marketAggregatorTimestamp: newerTimestamp,
            _exceedsTolerance: false
        });
    }
}

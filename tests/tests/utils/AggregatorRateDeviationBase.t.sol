// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";

import {UnitTest} from "tests/bases/UnitTest.sol";

import {IAggregatorRateDeviationBaseHarness} from "tests/interfaces/internal/IAggregatorRateDeviationBaseHarness.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

contract AggregatorRateDeviationBaseTest is UnitTest {
    uint256 olderTimestamp = 1122;
    uint256 newerTimestamp = olderTimestamp + 3;

    // DEPLOYMENT

    function __deployAggregator(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _marketAggregatorAddress,
        uint256 _deviationToleranceBps
    ) internal returns (IAggregatorRateDeviationBaseHarness aggregator) {
        return IAggregatorRateDeviationBaseHarness(
            deployCode(
                "AggregatorRateDeviationBaseHarness.sol",
                abi.encode(
                    _thisAggregatorDecimals,
                    _quoteConversionAggregatorAddress,
                    _quoteConversionAggregatorInverted,
                    _marketAggregatorAddress,
                    _deviationToleranceBps
                )
            )
        );
    }

    // TESTS

    function test_constructor_success() public {
        uint8 thisAggregatorDecimals = 10;
        address quoteConversionAggregatorAddress = address(new TestChainlinkAggregator(7));
        bool quoteConversionAggregatorInverted = true;
        address marketAggregatorAddress = address(new TestChainlinkAggregator(8));
        uint256 deviationToleranceBps = BPS_ONE_PERCENT * 10; // 10%

        IAggregatorRateDeviationBaseHarness aggregator = __deployAggregator({
            _thisAggregatorDecimals: thisAggregatorDecimals,
            _quoteConversionAggregatorAddress: quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: quoteConversionAggregatorInverted,
            _marketAggregatorAddress: marketAggregatorAddress,
            _deviationToleranceBps: deviationToleranceBps
        });

        assertEq(aggregator.decimals(), thisAggregatorDecimals, "Incorrect _thisAggregatorDecimals");
        assertEq(
            aggregator.QUOTE_CONVERSION_AGGREGATOR_ADDRESS(),
            quoteConversionAggregatorAddress,
            "Incorrect _quoteConversionAggregatorAddress"
        );
        assertEq(
            aggregator.QUOTE_CONVERSION_AGGREGATOR_INVERTED(),
            quoteConversionAggregatorInverted,
            "Incorrect _quoteConversionAggregatorInverted"
        );
        assertEq(aggregator.MARKET_AGGREGATOR_ADDRESS(), marketAggregatorAddress, "Incorrect _marketAggregatorAddress");
        assertEq(aggregator.DEVIATION_TOLERANCE_BPS(), deviationToleranceBps, "Incorrect _deviationToleranceBps");
    }

    // stack-too-deep
    struct BaseRateTestConfig {
        uint8 marketAggregatorDecimals;
        uint8 idealRateDecimals;
        uint256 idealRatePrecision;
        uint256 marketRatePrecision;
        TestChainlinkAggregator marketAggregator;
        uint256 deviationToleranceBps;
    }

    function __test_baseRate_success(
        uint256 _idealRateTimestamp,
        uint256 _marketAggregatorTimestamp,
        bool _exceedsTolerance
    ) internal {
        // use different decimals for market and ideal rates
        uint8 marketAggregatorDecimals = 12;
        uint8 idealRateDecimals = marketAggregatorDecimals - 3;

        // stack-too-deep
        BaseRateTestConfig memory config = BaseRateTestConfig({
            marketAggregatorDecimals: marketAggregatorDecimals,
            idealRateDecimals: idealRateDecimals,
            idealRatePrecision: 10 ** idealRateDecimals,
            marketRatePrecision: 10 ** marketAggregatorDecimals,
            marketAggregator: new TestChainlinkAggregator(marketAggregatorDecimals),
            deviationToleranceBps: BPS_ONE_PERCENT * 10 // 10%
        });

        // Deploy target aggregator (no quote conversion)
        IAggregatorRateDeviationBaseHarness aggregator = __deployAggregator({
            _thisAggregatorDecimals: 18,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false,
            _marketAggregatorAddress: address(config.marketAggregator),
            _deviationToleranceBps: config.deviationToleranceBps
        });

        // Set the ideal rate data
        uint256 idealRate = 123 * config.idealRatePrecision;
        aggregator.setIdealRate(idealRate);
        aggregator.setIdealRatePrecision(config.idealRatePrecision);
        aggregator.setIdealRateTimestamp(_idealRateTimestamp);

        // Calculate the deviation to apply to market rate
        uint256 marketRate;
        {
            uint256 relDeviation =
                _exceedsTolerance ? config.deviationToleranceBps + 1 : config.deviationToleranceBps - 1;
            uint256 absDeviation = idealRate * relDeviation / BPS_ONE_HUNDRED_PERCENT;
            // Set market rate as ideal rate + deviation, in the precision of market rate
            marketRate = (idealRate + absDeviation) * config.marketRatePrecision / config.idealRatePrecision;
        }

        // Set market rate data
        config.marketAggregator.setPrice(marketRate);
        config.marketAggregator.setTimestamp(_marketAggregatorTimestamp);

        // Query the base rate data
        (uint256 rate, uint256 ratePrecision, uint256 timestamp) = aggregator.baseRate();

        // Calculate the expected rate (in idealRate's precision)
        uint256 expectedRate =
            _exceedsTolerance ? marketRate * config.idealRatePrecision / config.marketRatePrecision : idealRate;

        assertEq(rate, expectedRate, "Incorrect rate");
        // Precision is always in idealRate's precision
        assertEq(ratePrecision, config.idealRatePrecision, "Incorrect ratePrecision");
        assertEq(timestamp, Math.min(_idealRateTimestamp, _marketAggregatorTimestamp), "Incorrect timestamp");
    }

    function test_baseRate_successExceedsToleranceAndOlderMarketRate() public {
        __test_baseRate_success({
            _idealRateTimestamp: newerTimestamp,
            _marketAggregatorTimestamp: olderTimestamp,
            _exceedsTolerance: true
        });
    }

    function test_baseRate_successWithinToleranceAndOlderIdealRate() public {
        __test_baseRate_success({
            _idealRateTimestamp: olderTimestamp,
            _marketAggregatorTimestamp: newerTimestamp,
            _exceedsTolerance: false
        });
    }
}

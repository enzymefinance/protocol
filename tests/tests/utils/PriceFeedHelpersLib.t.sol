// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {PriceFeedHelpersLib} from "contracts/release/infrastructure/price-feeds/utils/PriceFeedHelpersLib.sol";

import {UnitTest} from "tests/bases/UnitTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IPriceFeedHelpersLibHarness} from "tests/interfaces/internal/IPriceFeedHelpersLibHarness.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

contract PriceFeedHelpersLibTest is UnitTest {
    IPriceFeedHelpersLibHarness priceFeedHelpers;

    function setUp() public {
        priceFeedHelpers = IPriceFeedHelpersLibHarness(deployCode("PriceFeedHelpersLibHarness.sol"));
    }

    // TESTS

    function __test_exposed_convertRatePrecision_success(
        uint256 _rateWithoutPrecision,
        uint256 _fromPrecision,
        uint256 _toPrecision
    ) internal {
        uint256 convertedRate = priceFeedHelpers.exposed_convertRatePrecision({
            _rate: _rateWithoutPrecision * _fromPrecision,
            _fromPrecision: _fromPrecision,
            _toPrecision: _toPrecision
        });

        assertEq(convertedRate, _rateWithoutPrecision * _toPrecision, "Incorrect converted rate");
    }

    function test_exposed_convertRatePrecision_successToGreaterPrecision() public {
        __test_exposed_convertRatePrecision_success({
            _rateWithoutPrecision: 123,
            _fromPrecision: 1e20,
            _toPrecision: 1e22
        });
    }

    function test_exposed_convertRatePrecision_successToLowerPrecision() public {
        __test_exposed_convertRatePrecision_success({
            _rateWithoutPrecision: 456,
            _fromPrecision: 1e12,
            _toPrecision: 1e11
        });
    }

    function test_exposed_convertRateToNewQuoteAsset_success() public {
        uint256 aToBRate = 123e6;
        uint256 aToBRatePrecision = 1e6;
        uint256 bToCRate = 456e9;

        // Expected: multiplied rates in the precision of the quote asset
        uint256 expectedAToCRate = 123 * 456 * 1e9;

        uint256 convertedRate = priceFeedHelpers.exposed_convertRateToNewQuoteAsset({
            _baseRate: aToBRate,
            _baseRatePrecision: aToBRatePrecision,
            _quoteRate: bToCRate
        });

        assertEq(convertedRate, expectedAToCRate, "Incorrect converted rate");
    }

    function test_exposed_formatRateAsChainlinkAggregator_success() public {
        uint256 rate = 123;
        uint256 timestamp = 456;

        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            priceFeedHelpers.exposed_formatRateAsChainlinkAggregator({_rate: rate, _timestamp: timestamp});

        assertEq(roundId, 0, "Non-zero roundId");
        assertEq(startedAt, 0, "Non-zero startedAt");
        assertEq(answeredInRound, 0, "Non-zero answeredInRound");

        assertEq(answer, int256(rate), "Incorrect answer");
        assertEq(updatedAt, timestamp, "Incorrect updatedAt");
    }

    function test_exposed_invertRate_success() public {
        uint256 aToBRateWithoutPrecision = 123;
        uint256 aToBRatePrecision = 1e20;

        uint256 invertedRatePrecision = 1e27;

        // Expected: toPrecision * (1 / rate)
        uint256 expectedBToARate = invertedRatePrecision / aToBRateWithoutPrecision;

        uint256 convertedRate = priceFeedHelpers.exposed_invertRate({
            _rate: aToBRateWithoutPrecision * aToBRatePrecision,
            _ratePrecision: aToBRatePrecision,
            _toPrecision: invertedRatePrecision
        });

        assertEq(convertedRate, expectedBToARate, "Incorrect converted rate");
    }

    function test_exposed_parseRateFromChainlinkAggregator_failNegativeAnswer() public {
        TestChainlinkAggregator aggregator = new TestChainlinkAggregator(18);
        int256 negativeAnswer = -1;
        aggregator.setPriceInt(negativeAnswer);

        vm.expectRevert(
            abi.encodeWithSelector(
                PriceFeedHelpersLib.PriceFeedHelpersLib__ParseRateFromChainlinkAggregator__NegativeAnswer.selector,
                negativeAnswer
            )
        );

        priceFeedHelpers.exposed_parseRateFromChainlinkAggregator(address(aggregator));
    }

    function test_exposed_parsePrecisionFromChainlinkAggregator_success() public {
        uint8 decimals = 13;
        uint256 expectedPrecision = 10 ** 13;

        TestChainlinkAggregator aggregator = new TestChainlinkAggregator(decimals);

        uint256 parsedPrecision = priceFeedHelpers.exposed_parsePrecisionFromChainlinkAggregator(address(aggregator));

        assertEq(parsedPrecision, expectedPrecision, "Incorrect precision");
    }

    function test_exposed_parseRateFromChainlinkAggregator_success() public {
        uint256 rate = 123;
        uint256 timestamp = 456;

        TestChainlinkAggregator aggregator = new TestChainlinkAggregator(18);
        aggregator.setPrice(rate);
        aggregator.setTimestamp(timestamp);

        (uint256 parsedRate, uint256 parsedTimestamp) =
            priceFeedHelpers.exposed_parseRateFromChainlinkAggregator(address(aggregator));

        assertEq(parsedRate, rate, "Incorrect rate");
        assertEq(parsedTimestamp, timestamp, "Incorrect timestamp");
    }

    function test_exposed_selectOldestTimestamp_success() public {
        uint256 olderTimestamp = 123;
        uint256 newerTimestamp = 456;

        assertEq(
            priceFeedHelpers.exposed_selectOldestTimestamp(olderTimestamp, newerTimestamp),
            olderTimestamp,
            "Incorrect oldest timestamp"
        );
    }

    function test_exposed_selectRateByToleranceDeviation_success() public {
        uint256 idealRate = 1e18;
        uint256 toleranceBps = BPS_ONE_PERCENT * 10;

        uint256 tolerableBpsDeviation = toleranceBps - 1;
        uint256 intolerableBpsDeviation = toleranceBps + 1;

        uint256 tolerableDeviationAmount = idealRate * tolerableBpsDeviation / BPS_ONE_HUNDRED_PERCENT;
        uint256 intolerableDeviationAmount = idealRate * intolerableBpsDeviation / BPS_ONE_HUNDRED_PERCENT;

        // Within tolerance, upper bound
        assertEq(
            priceFeedHelpers.exposed_selectRateByToleranceDeviation({
                _idealRate: idealRate,
                _marketRate: idealRate + tolerableDeviationAmount,
                _deviationToleranceBps: toleranceBps
            }),
            idealRate,
            "Incorrect selected rate: within tolerance, upper bound"
        );

        // Within tolerance, lower bound
        assertEq(
            priceFeedHelpers.exposed_selectRateByToleranceDeviation({
                _idealRate: idealRate,
                _marketRate: idealRate - tolerableDeviationAmount,
                _deviationToleranceBps: toleranceBps
            }),
            idealRate,
            "Incorrect selected rate: within tolerance, lower bound"
        );

        // Exceeds tolerance, upper bound
        {
            uint256 marketRate = idealRate + intolerableDeviationAmount;
            assertEq(
                priceFeedHelpers.exposed_selectRateByToleranceDeviation({
                    _idealRate: idealRate,
                    _marketRate: marketRate,
                    _deviationToleranceBps: toleranceBps
                }),
                marketRate,
                "Incorrect selected rate: exceeds tolerance, upper bound"
            );
        }

        // Exceeds tolerance, lower bound
        {
            uint256 marketRate = idealRate - intolerableDeviationAmount;
            assertEq(
                priceFeedHelpers.exposed_selectRateByToleranceDeviation({
                    _idealRate: idealRate,
                    _marketRate: marketRate,
                    _deviationToleranceBps: toleranceBps
                }),
                marketRate,
                "Incorrect selected rate: exceeds tolerance, lower bound"
            );
        }
    }
}

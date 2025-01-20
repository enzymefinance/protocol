// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";

import {UnitTest} from "tests/bases/UnitTest.sol";

import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IRateAggregatorBaseHarness} from "tests/interfaces/internal/IRateAggregatorBaseHarness.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

contract RateAggregatorBaseTest is UnitTest {
    // DEPLOYMENT

    function __deployRateAggregator(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted
    ) internal returns (IRateAggregatorBaseHarness rateAggregator_) {
        return IRateAggregatorBaseHarness(
            deployCode(
                "RateAggregatorBaseHarness.sol",
                abi.encode(
                    _thisAggregatorDecimals, _quoteConversionAggregatorAddress, _quoteConversionAggregatorInverted
                )
            )
        );
    }

    // HELPERS

    // helps with stack-too-deep
    function __calcPrecision(uint8 _decimals) internal pure returns (uint256 precision_) {
        return 10 ** _decimals;
    }

    // TESTS

    function test_decimals_success() public {
        uint8 aggregatorDecimals = 12;

        IRateAggregatorBaseHarness rateAggregator = __deployRateAggregator({
            _thisAggregatorDecimals: aggregatorDecimals,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false
        });

        assertEq(rateAggregator.decimals(), aggregatorDecimals, "Incorrect decimals");
    }

    function __test_latestRoundData_successNoQuoteAggregator(uint8 _aggregatorDecimals, uint8 _rateDecimals) internal {
        uint256 rateWithoutPrecision = 123;
        uint256 rate = rateWithoutPrecision * __calcPrecision(_rateDecimals);
        uint256 timestamp = 456;

        IRateAggregatorBaseHarness rateAggregator = __deployRateAggregator({
            _thisAggregatorDecimals: _aggregatorDecimals,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false
        });

        rateAggregator.setRate(rate);
        rateAggregator.setRatePrecision(__calcPrecision(_rateDecimals));
        rateAggregator.setTimestamp(timestamp);

        (, int256 answer,, uint256 updatedAt,) = rateAggregator.latestRoundData();

        assertEq(uint256(answer), rateWithoutPrecision * __calcPrecision(_aggregatorDecimals), "Incorrect answer");
        assertEq(updatedAt, timestamp, "Incorrect updatedAt");
    }

    function test_latestRoundData_successNoQuoteAggregatorSamePrecisions() public {
        __test_latestRoundData_successNoQuoteAggregator({_aggregatorDecimals: 12, _rateDecimals: 12});
    }

    function test_latestRoundData_successNoQuoteAggregatorUniquePrecisions() public {
        __test_latestRoundData_successNoQuoteAggregator({_aggregatorDecimals: 17, _rateDecimals: 12});
    }

    function __test_latestRoundData_successConvertQuote(
        uint256 _rateTimestamp,
        uint256 _quoteTimestamp,
        bool _invertedQuote
    ) internal {
        // Use different precisions for rate, quote, and aggregator
        uint8 rateDecimals = 12;
        uint8 quoteDecimals = rateDecimals + 3;
        uint8 aggregatorDecimals = rateDecimals + 5;

        uint256 rateWithoutPrecision = 123;
        uint256 quoteWithoutPrecision = 456;

        // Deploy a quote conversion aggregator
        TestChainlinkAggregator quoteConversionAggregator = new TestChainlinkAggregator(quoteDecimals);
        quoteConversionAggregator.setPrice(quoteWithoutPrecision * __calcPrecision(quoteDecimals));
        quoteConversionAggregator.setTimestamp(_quoteTimestamp);

        // Deploy the rate aggregator
        IRateAggregatorBaseHarness rateAggregator = __deployRateAggregator({
            _thisAggregatorDecimals: aggregatorDecimals,
            _quoteConversionAggregatorAddress: address(quoteConversionAggregator),
            _quoteConversionAggregatorInverted: _invertedQuote
        });
        rateAggregator.setRate(rateWithoutPrecision * __calcPrecision(rateDecimals));
        rateAggregator.setRatePrecision(__calcPrecision(rateDecimals));
        rateAggregator.setTimestamp(_rateTimestamp);

        // Fetch the aggregator response
        (, int256 answer,, uint256 updatedAt,) = rateAggregator.latestRoundData();

        // Calculate expected answer
        uint256 expectedFinalRate;
        if (_invertedQuote) {
            expectedFinalRate = __calcPrecision(aggregatorDecimals) * rateWithoutPrecision / quoteWithoutPrecision;
        } else {
            expectedFinalRate = __calcPrecision(aggregatorDecimals) * rateWithoutPrecision * quoteWithoutPrecision;
        }

        assertEq(uint256(answer), expectedFinalRate, "Incorrect answer");
        assertEq(updatedAt, Math.min(_rateTimestamp, _quoteTimestamp), "Incorrect updatedAt");
    }

    function test_latestRoundData_successConvertQuoteStandardOlderQuote() public {
        __test_latestRoundData_successConvertQuote({_rateTimestamp: 2244, _quoteTimestamp: 1122, _invertedQuote: false});
    }

    function test_latestRoundData_successConvertQuoteStandardOlderRate() public {
        __test_latestRoundData_successConvertQuote({_rateTimestamp: 1122, _quoteTimestamp: 2244, _invertedQuote: false});
    }

    function test_latestRoundData_successConvertQuoteInvertedOlderQuote() public {
        __test_latestRoundData_successConvertQuote({_rateTimestamp: 2244, _quoteTimestamp: 1122, _invertedQuote: true});
    }

    function test_latestRoundData_successConvertQuoteInvertedOlderRate() public {
        __test_latestRoundData_successConvertQuote({_rateTimestamp: 1122, _quoteTimestamp: 2244, _invertedQuote: true});
    }
}

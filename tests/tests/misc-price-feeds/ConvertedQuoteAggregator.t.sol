// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {UnitTest} from "tests/bases/UnitTest.sol";
import {IConvertedQuoteAggregator} from "tests/interfaces/internal/IConvertedQuoteAggregator.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

contract ConvertedQuoteAggregatorTest is UnitTest {
    function __deployAggregator(
        uint8 _thisAggregatorDecimals,
        address _quoteConversionAggregatorAddress,
        bool _quoteConversionAggregatorInverted,
        address _sourceAggregatorAddress
    ) private returns (IConvertedQuoteAggregator convertedQuoteAggregator_) {
        return IConvertedQuoteAggregator(
            deployCode(
                "ConvertedQuoteAggregator.sol",
                abi.encode(
                    _thisAggregatorDecimals,
                    _quoteConversionAggregatorAddress,
                    _quoteConversionAggregatorInverted,
                    _sourceAggregatorAddress
                )
            )
        );
    }

    function test_constructor_success() public {
        uint8 thisAggregatorDecimals = 13;
        address quoteConversionAggregatorAddress = address(new TestChainlinkAggregator(18));
        bool quoteConversionAggregatorInverted = true;
        address sourceAggregatorAddress = address(new TestChainlinkAggregator(10));

        IConvertedQuoteAggregator convertedQuoteAggregator = __deployAggregator({
            _thisAggregatorDecimals: thisAggregatorDecimals,
            _quoteConversionAggregatorAddress: quoteConversionAggregatorAddress,
            _quoteConversionAggregatorInverted: quoteConversionAggregatorInverted,
            _sourceAggregatorAddress: sourceAggregatorAddress
        });

        assertEq(convertedQuoteAggregator.decimals(), thisAggregatorDecimals, "Incorrect _thisAggregatorDecimals");
        assertEq(
            convertedQuoteAggregator.QUOTE_CONVERSION_AGGREGATOR_ADDRESS(),
            quoteConversionAggregatorAddress,
            "Incorrect _quoteConversionAggregatorAddress"
        );
        assertEq(
            convertedQuoteAggregator.QUOTE_CONVERSION_AGGREGATOR_INVERTED(),
            quoteConversionAggregatorInverted,
            "Incorrect _quoteConversionAggregatorInverted"
        );
        assertEq(
            convertedQuoteAggregator.SOURCE_AGGREGATOR_ADDRESS(),
            sourceAggregatorAddress,
            "Incorrect _sourceAggregatorAddress"
        );
    }

    function test_baseRate_success() public {
        // Use different decimals for source and this aggregator
        uint8 thisAggregatorDecimals = 13;
        uint8 sourceAggregatorDecimals = 10;
        uint256 sourceAggregatorPrecision = 10 ** sourceAggregatorDecimals;
        TestChainlinkAggregator sourceAggregator = new TestChainlinkAggregator(sourceAggregatorDecimals);

        // Define rate and timestamp on source aggregator
        uint256 sourceRate = 123 * sourceAggregatorPrecision;
        uint256 sourceTimestamp = 45678;
        sourceAggregator.setPrice(sourceRate);
        sourceAggregator.setTimestamp(sourceTimestamp);

        // Deploy aggregator
        IConvertedQuoteAggregator convertedQuoteAggregator = __deployAggregator({
            _thisAggregatorDecimals: thisAggregatorDecimals,
            _quoteConversionAggregatorAddress: address(0),
            _quoteConversionAggregatorInverted: false,
            _sourceAggregatorAddress: address(sourceAggregator)
        });

        (uint256 baseRate, uint256 baseRatePrecision, uint256 baseRateTimestamp) = convertedQuoteAggregator.baseRate();

        assertEq(baseRate, sourceRate, "Incorrect baseRate");
        assertEq(baseRatePrecision, sourceAggregatorPrecision, "Incorrect baseRatePrecision");
        assertEq(baseRateTimestamp, sourceTimestamp, "Incorrect baseRateTimestamp");
    }
}

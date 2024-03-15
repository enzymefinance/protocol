// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {INonStandardPrecisionSimulatedAggregator} from
    "tests/interfaces/internal/INonStandardPrecisionSimulatedAggregator.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

contract NonStandardPrecisionSimulatedAggregatorTest is IntegrationTest {
    // Dummy values for the original aggregator (everything but answer)
    uint80 dummyRoundId = 4;
    uint256 dummyStartedAt = 88;
    uint256 dummyUpdatedAt = 99;
    uint80 dummyAnsweredInRound = 100;

    // DEPLOYMENT HELPERS

    function __deploySimulatedAggregator(
        address _originalAggregatorAddress,
        IChainlinkPriceFeedMixinProd.RateAsset _rateAsset
    ) private returns (IChainlinkAggregator) {
        bytes memory args = abi.encode(_originalAggregatorAddress, _rateAsset);
        address addr = deployCode("NonStandardPrecisionSimulatedAggregator.sol", args);
        return IChainlinkAggregator(addr);
    }

    // MISC HELPERS

    function __mockAggregatorLatestRoundData(address _aggregatorAddress, int256 _answer) internal {
        vm.mockCall({
            callee: _aggregatorAddress,
            data: abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
            returnData: abi.encode(dummyRoundId, _answer, dummyStartedAt, dummyUpdatedAt, dummyAnsweredInRound)
        });
    }

    // TESTS

    function test_constructor_failsWithUnsupportedRateAsset() public {
        address aggregatorAddress = address(createTestAggregator({_decimals: CHAINLINK_AGGREGATOR_DECIMALS_ETH}));

        // Fails before arriving to constructor's revert() since `badRateAsset` is outside of the enum range
        vm.expectRevert();
        uint8 badRateAsset = 2; // Only 0 and 1 are valid
        // Must use `deployCode` to pass in rate asset as untyped
        deployCode("NonStandardPrecisionSimulatedAggregator.sol", abi.encode(aggregatorAddress, badRateAsset));
    }

    function test_constructor_failsWithStandardRateDecimals() public {
        bytes4 revertReason = INonStandardPrecisionSimulatedAggregator.NoScalingNeeded.selector;

        // ETH RATE

        address ethStandardAggregatorAddress =
            address(createTestAggregator({_decimals: CHAINLINK_AGGREGATOR_DECIMALS_ETH}));

        vm.expectRevert(revertReason);
        __deploySimulatedAggregator({
            _originalAggregatorAddress: ethStandardAggregatorAddress,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH
        });

        // USD RATE

        address usdStandardAggregatorAddress =
            address(createTestAggregator({_decimals: CHAINLINK_AGGREGATOR_DECIMALS_USD}));

        vm.expectRevert(revertReason);
        __deploySimulatedAggregator({
            _originalAggregatorAddress: usdStandardAggregatorAddress,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.USD
        });
    }

    function test_decimals_successWithEthRate() public {
        address originalAggregatorAddress = address(createTestAggregator({_decimals: 5}));

        IChainlinkAggregator simulatedAggregator = __deploySimulatedAggregator({
            _originalAggregatorAddress: originalAggregatorAddress,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH
        });

        assertEq(simulatedAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_ETH, "Incorrect decimals");
    }

    function test_decimals_successWithUsdRate() public {
        address originalAggregatorAddress = address(createTestAggregator({_decimals: 5}));

        IChainlinkAggregator simulatedAggregator = __deploySimulatedAggregator({
            _originalAggregatorAddress: originalAggregatorAddress,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.USD
        });

        assertEq(simulatedAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_USD, "Incorrect decimals");
    }

    function test_latestRoundData_failsWithNegativeAnswer() public {
        // Arbitrary decimals and rate asset
        uint8 decimals = 12;
        IChainlinkPriceFeedMixinProd.RateAsset rateAsset = IChainlinkPriceFeedMixinProd.RateAsset.ETH;

        address originalAggregatorAddress = address(createTestAggregator({_decimals: decimals}));
        __mockAggregatorLatestRoundData({
            _aggregatorAddress: originalAggregatorAddress,
            _answer: -1 // Negative answer
        });

        // Deploy the simulated aggregator
        IChainlinkAggregator simulatedAggregator =
            __deploySimulatedAggregator({_originalAggregatorAddress: originalAggregatorAddress, _rateAsset: rateAsset});

        vm.expectRevert(INonStandardPrecisionSimulatedAggregator.NegativeAnswer.selector);
        simulatedAggregator.latestRoundData();
    }

    function test_latestRoundData_successWithEthRateAndHighDecimals() public {
        __test_latestRoundData_success({
            _originalAggregatorDecimals: CHAINLINK_AGGREGATOR_DECIMALS_ETH + 5,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH
        });
    }

    function test_latestRoundData_successWithEthRateAndLowDecimals() public {
        __test_latestRoundData_success({
            _originalAggregatorDecimals: CHAINLINK_AGGREGATOR_DECIMALS_ETH - 3,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH
        });
    }

    function test_latestRoundData_successWithUsdRateAndHighDecimals() public {
        __test_latestRoundData_success({
            _originalAggregatorDecimals: CHAINLINK_AGGREGATOR_DECIMALS_USD + 6,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.USD
        });
    }

    function test_latestRoundData_successWithUsdRateAndLowDecimals() public {
        __test_latestRoundData_success({
            _originalAggregatorDecimals: CHAINLINK_AGGREGATOR_DECIMALS_USD - 2,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.USD
        });
    }

    function __test_latestRoundData_success(
        uint8 _originalAggregatorDecimals,
        IChainlinkPriceFeedMixinProd.RateAsset _rateAsset
    ) internal {
        uint8 standardDecimals = _rateAsset == IChainlinkPriceFeedMixinProd.RateAsset.ETH
            ? CHAINLINK_AGGREGATOR_DECIMALS_ETH
            : CHAINLINK_AGGREGATOR_DECIMALS_USD;

        // Define the original and expected answers
        uint256 answerUnits = 123;
        uint256 originalAggregatorAnswer = answerUnits * (10 ** _originalAggregatorDecimals);
        uint256 expectedSimulatedAggregatorAnswer = answerUnits * (10 ** standardDecimals);

        // Deploy the original (mock chainlink) aggregator,
        // and populate all additional values of latestRoundData
        address originalAggregatorAddress = address(createTestAggregator({_decimals: _originalAggregatorDecimals}));
        __mockAggregatorLatestRoundData({
            _aggregatorAddress: originalAggregatorAddress,
            _answer: int256(originalAggregatorAnswer)
        });

        // Deploy the simulated aggregator
        IChainlinkAggregator simulatedAggregator =
            __deploySimulatedAggregator({_originalAggregatorAddress: originalAggregatorAddress, _rateAsset: _rateAsset});

        (
            uint80 actualRoundId,
            int256 actualAnswer,
            uint256 actualStartedAt,
            uint256 actualUpdatedAt,
            uint80 actualAnsweredInRound
        ) = simulatedAggregator.latestRoundData();

        assertEq(actualRoundId, dummyRoundId, "Incorrect roundId");
        assertEq(actualAnswer, int256(expectedSimulatedAggregatorAnswer), "Incorrect answer");
        assertEq(actualStartedAt, dummyStartedAt, "Incorrect startedAt");
        assertEq(actualUpdatedAt, dummyUpdatedAt, "Incorrect updatedAt");
        assertEq(actualAnsweredInRound, dummyAnsweredInRound, "Incorrect answeredInRound");
    }
}

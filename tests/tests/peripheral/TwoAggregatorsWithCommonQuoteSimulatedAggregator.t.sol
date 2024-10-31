// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {Strings} from "openzeppelin-solc-0.8/utils/Strings.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";

contract TwoAggregatorsWithCommonQuoteSimulatedAggregatorTest is IntegrationTest {
    uint256 mockAggregatorCount;

    function setUp() public virtual override {
        // Override to prevent any default logic
    }

    // DEPLOYMENT HELPERS

    function __deploySimulatedAggregator(
        address _baseAggregatorAddress,
        address _quoteAggregatorAddress,
        uint256 _precisionDecimals
    ) private returns (IChainlinkAggregator) {
        bytes memory args = abi.encode(_baseAggregatorAddress, _quoteAggregatorAddress, _precisionDecimals);
        address addr = deployCode("TwoAggregatorsWithCommonQuoteSimulatedAggregator.sol", args);
        return IChainlinkAggregator(addr);
    }

    // MISC HELPERS

    function __createMockAggregator(uint256 _decimals) internal returns (address mockAggregatorAddress_) {
        mockAggregatorAddress_ = makeAddr(string.concat("MockAggregator", Strings.toString(++mockAggregatorCount)));
        vm.mockCall({
            callee: mockAggregatorAddress_,
            data: abi.encodeWithSelector(IChainlinkAggregator.decimals.selector),
            returnData: abi.encode(_decimals)
        });
    }

    function __mockAggregatorLatestRoundData(address _aggregatorAddress, int256 _answer, uint256 _updatedAt) internal {
        uint80 dummyRoundId = 4;
        uint256 dummyStartedAt = 88;
        uint80 dummyAnsweredInRound = 100;

        vm.mockCall({
            callee: _aggregatorAddress,
            data: abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
            returnData: abi.encode(dummyRoundId, _answer, dummyStartedAt, _updatedAt, dummyAnsweredInRound)
        });
    }

    // TESTS

    function test_decimals_success() public {
        uint256 precisionDecimals = 17;

        // Deploy aggregators that are NOT the expected precision decimals of the simulated aggregator
        IChainlinkAggregator simulatedAggregator = __deploySimulatedAggregator({
            _baseAggregatorAddress: __createMockAggregator({_decimals: 16}),
            _quoteAggregatorAddress: __createMockAggregator({_decimals: 21}),
            _precisionDecimals: precisionDecimals
        });

        assertEq(simulatedAggregator.decimals(), precisionDecimals, "Incorrect decimals");
    }

    function test_latestRoundData_successWithGreaterAssetAggregatorDecimalsAndUpdateTimestamp() public {
        __test_latestRoundData_success({
            _baseAggregatorDecimals: 21,
            _quoteAggregatorDecimals: 16,
            _baseAggregatorUpdatedAt: 456,
            _quoteAggregatorUpdatedAt: 123
        });
    }

    function test_latestRoundData_successWithLesserAssetAggregatorDecimalsAndUpdateTimestamp() public {
        __test_latestRoundData_success({
            _baseAggregatorDecimals: 7,
            _quoteAggregatorDecimals: 15,
            _baseAggregatorUpdatedAt: 123,
            _quoteAggregatorUpdatedAt: 456
        });
    }

    function __test_latestRoundData_success(
        uint256 _baseAggregatorDecimals,
        uint256 _baseAggregatorUpdatedAt,
        uint256 _quoteAggregatorDecimals,
        uint256 _quoteAggregatorUpdatedAt
    ) internal {
        uint256 precisionDecimals = 18;
        address baseAggregatorAddress = __createMockAggregator({_decimals: uint8(_baseAggregatorDecimals)});
        address quoteAggregatorAddress = __createMockAggregator({_decimals: uint8(_quoteAggregatorDecimals)});

        IChainlinkAggregator simulatedAggregator = __deploySimulatedAggregator({
            _baseAggregatorAddress: baseAggregatorAddress,
            _quoteAggregatorAddress: quoteAggregatorAddress,
            _precisionDecimals: precisionDecimals
        });

        int256 expectedAnswer = int256(5 * 10 ** precisionDecimals); // i.e., 5 eth per 1 asset

        {
            // Assign constant aggregator answers relative to their decimals, so that no matter what, the expected answer is the same
            int256 baseAggregatorAnswer = int256(15 * 10 ** _baseAggregatorDecimals); // i.e., 15 btc per 1 asset
            int256 quoteAggregatorAnswer = int256(3 * 10 ** _quoteAggregatorDecimals); // i.e., 3 btc per 1 eth

            __mockAggregatorLatestRoundData({
                _aggregatorAddress: baseAggregatorAddress,
                _answer: baseAggregatorAnswer,
                _updatedAt: _baseAggregatorUpdatedAt
            });

            __mockAggregatorLatestRoundData({
                _aggregatorAddress: quoteAggregatorAddress,
                _answer: quoteAggregatorAnswer,
                _updatedAt: _quoteAggregatorUpdatedAt
            });
        }

        (
            uint80 actualRound,
            int256 actualAnswer,
            uint256 actualStartedAt,
            uint256 actualUpdatedAt,
            uint80 actualAnsweredInRound
        ) = simulatedAggregator.latestRoundData();

        assertEq(actualRound, 0, "Incorrect round");
        assertEq(actualStartedAt, 0, "Incorrect startedAt");
        assertEq(actualAnsweredInRound, 0, "Incorrect answeredInRound");
        assertEq(actualAnswer, expectedAnswer, "Incorrect answer");
        assertEq(actualUpdatedAt, Math.min(_baseAggregatorUpdatedAt, _quoteAggregatorUpdatedAt), "Incorrect updatedAt");
    }
}

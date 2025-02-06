// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

address constant STADER_STAKE_POOLS_MANAGER_ADDRESS = 0xcf5EA1b38380f6aF39068375516Daf40Ed70D299;

contract StaderEthXRateEthAggregatorTest is IntegrationTest {
    IChainlinkAggregator internal aggregator;

    function setUp() public override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TIME_SENSITIVE);
        aggregator = __deployAggregator();
    }

    // DEPLOYMENT HELPERS

    function __deployAggregator() private returns (IChainlinkAggregator) {
        address addr = deployCode("StaderEthXRateEthAggregator.sol", abi.encode(STADER_STAKE_POOLS_MANAGER_ADDRESS));
        return IChainlinkAggregator(addr);
    }

    // TESTS

    function test_decimals() public {
        assertEq(aggregator.decimals(), uint8(18), "Incorrect decimals");
    }

    function test_latestRoundData() public {
        // Set block timestamp to validate reported timestamp
        uint256 timestamp = 1234;
        vm.warp(timestamp);

        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            aggregator.latestRoundData();

        assertEq(roundId, 0, "Non-zero roundId");
        assertEq(startedAt, 0, "Non-zero startedAt");
        assertEq(answeredInRound, 0, "Non-zero answeredInRound");

        assertEq(updatedAt, timestamp, "Incorrect updatedAt");

        // ETHx/ETH price on Jan 26th 2025
        assertEq(answer, int256(1050996995049050031), "Incorrect answer");
    }
}

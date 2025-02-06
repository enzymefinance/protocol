// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";

address constant SOLV_BTC_BBN = 0xd9D920AA40f578ab794426F5C90F6C731D159DEf;
address constant SOLV_BTC_IN_USD_AGGREGATOR = 0x24c8964338Deb5204B096039147B8e8C3AEa42Cc;

contract Test is IntegrationTest {
    IChainlinkAggregator yieldTokenAggregator;

    function setUp() public override {
        vm.createSelectFork("mainnet", ETHEREUM_BLOCK_TIME_SENSITIVE);

        yieldTokenAggregator = __deployYieldTokenAggregator({_solvBtcYieldTokenAddress: SOLV_BTC_BBN});
    }

    // DEPLOYMENT HELPERS

    function __deployYieldTokenAggregator(address _solvBtcYieldTokenAddress)
        private
        returns (IChainlinkAggregator aggregator_)
    {
        bytes memory args = abi.encode(SOLV_BTC_IN_USD_AGGREGATOR, _solvBtcYieldTokenAddress);

        return IChainlinkAggregator(deployCode("SolvBtcYieldTokenRateUsdAggregator.sol", args));
    }

    // TESTS

    function test_decimals_success() public {
        assertEq(yieldTokenAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_USD, "Incorrect decimals");
    }

    function test_latestRoundData_success() public {
        (uint256 rate,) = parseRateFromChainlinkAggregator(address(yieldTokenAggregator));

        // Yield-bearing token, so price should gradually grow from 1 BTC
        // BTC price on Jan 26, 2025: $102-105k
        assertEq(rate, 10465349056256, "Incorrect rate");
    }
}

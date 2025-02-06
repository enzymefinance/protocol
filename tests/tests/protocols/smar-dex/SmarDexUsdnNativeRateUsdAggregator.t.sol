// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";

address constant USDN_PROTOCOL_ADDRESS = 0x656cB8C6d154Aad29d8771384089be5B5141f01a;

contract Test is IntegrationTest {
    IChainlinkAggregator usdnAggregator;
    address wstethUsdAggregatorAddress;

    function setUp() public override {
        vm.createSelectFork("mainnet", ETHEREUM_BLOCK_LATEST);

        // Deploy the USDN aggregator
        usdnAggregator = __deployUsdnAggregator();
    }

    // DEPLOYMENT HELPERS

    function __deployUsdnAggregator() private returns (IChainlinkAggregator usdnAggregator_) {
        bytes memory args = abi.encode(USDN_PROTOCOL_ADDRESS);

        return IChainlinkAggregator(deployCode("SmarDexUsdnNativeRateUsdAggregator.sol", args));
    }

    // TESTS

    function test_decimals_success() public {
        assertEq(usdnAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_USD, "Incorrect decimals");
    }

    function test_latestRoundData_success() public {
        (uint256 usdnRate,) = parseRateFromChainlinkAggregator(address(usdnAggregator));

        // Should be very close to 1, unless the rate starts to depeg
        uint256 expectedRate = 1e8; // "1" in USD aggregator precision
        uint256 percentTolerance = WEI_ONE_PERCENT; // 1% tolerance
        assertApproxEqRel(usdnRate, expectedRate, percentTolerance, "Incorrect rate");
    }
}

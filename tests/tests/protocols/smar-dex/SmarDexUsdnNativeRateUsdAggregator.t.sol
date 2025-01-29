// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";

address constant USDN_PROTOCOL_ADDRESS = 0x656cB8C6d154Aad29d8771384089be5B5141f01a;
// Enzyme's `ChainlinkLikeWstethPriceFeed`
address constant WSTETH_ETH_AGGREGATOR = 0x92829C41115311cA43D5c9f722f0E9e7b9fcd30a;

contract Test is IntegrationTest {
    IChainlinkAggregator usdnAggregator;
    address wstethUsdAggregatorAddress;

    function setUp() public override {
        vm.createSelectFork("mainnet", ETHEREUM_BLOCK_LATEST);

        // TODO: can replace with live address once it's deployed
        // Deploy the wstETH/USD aggregator
        wstethUsdAggregatorAddress = __deployWstethInUsdAggregator();

        // Deploy the USDN aggregator
        usdnAggregator = __deployUsdnAggregator(wstethUsdAggregatorAddress);
    }

    // DEPLOYMENT HELPERS

    function __deployUsdnAggregator(address _wstethInUsdAggregatorAddress)
        private
        returns (IChainlinkAggregator usdnAggregator_)
    {
        bytes memory args = abi.encode(USDN_PROTOCOL_ADDRESS, _wstethInUsdAggregatorAddress);

        return IChainlinkAggregator(deployCode("SmarDexUsdnNativeRateUsdAggregator.sol", args));
    }

    function __deployWstethInUsdAggregator() private returns (address wstethAggregatorAddress_) {
        // Convert wstETH from ETH to USD quote using ETH/USD
        return deployCode(
            "ConvertedQuoteAggregator.sol",
            abi.encode(CHAINLINK_AGGREGATOR_DECIMALS_USD, ETHEREUM_ETH_USD_AGGREGATOR, false, WSTETH_ETH_AGGREGATOR)
        );
    }

    // TESTS

    function test_decimals_success() public {
        assertEq(usdnAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_USD, "Incorrect decimals");
    }

    function test_latestRoundData_success() public {
        (, uint256 wstethUsdTimestamp) = parseRateFromChainlinkAggregator(wstethUsdAggregatorAddress);
        (uint256 usdnRate, uint256 usdnTimestamp) = parseRateFromChainlinkAggregator(address(usdnAggregator));

        // Should be very close to 1, unless the rate starts to depeg
        uint256 expectedRate = 1e8; // "1" in USD aggregator precision
        uint256 percentTolerance = WEI_ONE_PERCENT; // 1% tolerance
        assertApproxEqRel(usdnRate, expectedRate, percentTolerance, "Incorrect rate");
        // Timestamp should be that of the wsteth aggregator
        assertEq(usdnTimestamp, wstethUsdTimestamp, "Incorrect timestamp");
    }
}

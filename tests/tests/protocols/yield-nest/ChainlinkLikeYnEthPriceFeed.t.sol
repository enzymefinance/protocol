// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ICurveV2TwocryptoPool} from "contracts/external-interfaces/ICurveV2TwocryptoPool.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";

contract ChainlinkLikeYnethPriceFeedTest is IntegrationTest {
    address curveYnethWstethPoolAddress = 0x19B8524665aBAC613D82eCE5D8347BA44C714bDd;
    address wstethAggregator = 0x92829C41115311cA43D5c9f722f0E9e7b9fcd30a;

    IChainlinkAggregator ynethAggregator;
    IChainlinkAggregator originalWstethEthAggregator = IChainlinkAggregator(wstethAggregator);

    function setUp() public override {
        vm.createSelectFork("mainnet", ETHEREUM_BLOCK_TIME_SENSITIVE);

        ynethAggregator = __deployYnethAggregator();
    }

    // DEPLOYMENT HELPERS

    function __deployYnethAggregator() private returns (IChainlinkAggregator ynethAggregator_) {
        bytes memory args = abi.encode(curveYnethWstethPoolAddress, wstethAggregator);

        address addr = deployCode("ChainlinkLikeYnEthPriceFeed.sol", args);

        return IChainlinkAggregator(addr);
    }

    // TESTS

    function test_decimals_success() public {
        assertEq(ynethAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_ETH, "Incorrect decimals");
    }

    function test_latestRoundData_successWithForkData() public {
        // Query return data of wstETH/ETH aggregator and the simulated ynETH/ETH aggregator
        (,, uint256 originalStartedAt, uint256 originalUpdatedAt,) = originalWstethEthAggregator.latestRoundData();
        (
            uint80 ynethRoundId,
            int256 ynethAnswer,
            uint256 ynethStartedAt,
            uint256 ynethUpdatedAt,
            uint80 ynethAnsweredInRound
        ) = ynethAggregator.latestRoundData();

        // startedAt and updatedAt should be passed-through as-is
        assertEq(ynethStartedAt, originalStartedAt, "Incorrect startedAt");
        assertEq(ynethUpdatedAt, originalUpdatedAt, "Incorrect updatedAt");

        // Round values should be empty
        assertEq(ynethRoundId, 0, "Non-zero roundId");
        assertEq(ynethAnsweredInRound, 0, "Non-zero roundData");

        // Rate: 1.007 ETH/ynETH, on Jan 26th, 2025
        // https://www.coingecko.com/en/coins/yieldnest-restaked-eth
        uint256 expectedYnethEthRate = 1.007e18;
        uint256 halfPercent = WEI_ONE_PERCENT / 2;
        assertApproxEqRel(uint256(ynethAnswer), expectedYnethEthRate, halfPercent, "Incorrect rate");
    }

    function test_latestRoundData_successWithAlteredRates() public {
        // Mock return values of wstETH and ynETH sources to be:
        // - eth-per-wsteth rate is 5e18
        // - yneth-per-wsteth rate is 2e18
        // Expected eth-per-wsteth rate: 2.5e18
        uint256 ethPerWstethRate = 5e18;
        uint256 ynethPerWstethRate = 2e18;
        uint256 expectedEthPerYnethRate = 2.5e18;

        // Mock call on the wstETH aggregator
        vm.mockCall({
            callee: address(originalWstethEthAggregator),
            data: abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
            returnData: abi.encode(1, ethPerWstethRate, 345, 456, 2)
        });

        // Mock call on the Curve price oracle
        vm.mockCall({
            callee: curveYnethWstethPoolAddress,
            data: abi.encodeWithSelector(ICurveV2TwocryptoPool.price_oracle.selector),
            returnData: abi.encode(ynethPerWstethRate)
        });

        (, int256 wstethAnswer,,,) = ynethAggregator.latestRoundData();
        assertEq(uint256(wstethAnswer), expectedEthPerYnethRate, "Incorrect rate");
    }
}

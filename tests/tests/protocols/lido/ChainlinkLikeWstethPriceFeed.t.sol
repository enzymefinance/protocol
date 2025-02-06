// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IChainlinkAggregator} from "tests/interfaces/external/IChainlinkAggregator.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ILidoSteth} from "tests/interfaces/external/ILidoSteth.sol";

import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract ChainlinkLikeWstethPriceFeedTest is IntegrationTest {
    IChainlinkAggregator wstethAggregator;
    IChainlinkAggregator originalStethEthAggregator = IChainlinkAggregator(ETHEREUM_STETH_ETH_AGGREGATOR);

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();
        version = _version;
        wstethAggregator = __deployWstethAggregator();
    }

    function __reinitialize(uint256 _forkBlock) private {
        setUpMainnetEnvironment(_forkBlock);
        wstethAggregator = __deployWstethAggregator();
    }

    // DEPLOYMENT HELPERS

    function __deployWstethAggregator() private returns (IChainlinkAggregator wstethAggregator_) {
        bytes memory args = abi.encode(ETHEREUM_STETH, ETHEREUM_STETH_ETH_AGGREGATOR);

        address addr = deployCode("ChainlinkLikeWstethPriceFeed.sol", args);

        return IChainlinkAggregator(addr);
    }

    // TESTS

    function test_calcUnderlyingValuesForSpecificBlock_success() public {
        __reinitialize(ETHEREUM_BLOCK_TIME_SENSITIVE);

        addPrimitive({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: ETHEREUM_WSTETH,
            _skipIfRegistered: false,
            _aggregatorAddress: address(wstethAggregator),
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH
        });

        // WSTETH/USD price on Jan 26th 2025 https://www.coingecko.com/en/coins/wrapped-steth/historical_data
        assertValueInUSDForVersion({
            _version: version,
            _asset: ETHEREUM_WSTETH,
            _amount: assetUnit(IERC20(ETHEREUM_WSTETH)),
            _expected: 3944813217073595265581 // 3944.813217073595265581 USD
        });
    }

    function test_decimals_success() public {
        assertEq(wstethAggregator.decimals(), CHAINLINK_AGGREGATOR_DECIMALS_ETH, "Incorrect decimals");
    }

    function test_latestRoundData_successWithForkData() public {
        // Query return data of stETH/ETH aggregator and the simulated wstETH/ETH aggregator
        (,, uint256 originalStartedAt, uint256 originalUpdatedAt,) = originalStethEthAggregator.latestRoundData();
        (
            uint80 wstethRoundId,
            int256 wstethAnswer,
            uint256 wstethStartedAt,
            uint256 wstethUpdatedAt,
            uint80 wstethAnsweredInRound
        ) = wstethAggregator.latestRoundData();

        // startedAt and updatedAt should be passed-through as-is
        assertEq(wstethStartedAt, originalStartedAt, "Incorrect startedAt");
        assertEq(wstethUpdatedAt, originalUpdatedAt, "Incorrect updatedAt");

        // Round values should be empty
        assertEq(wstethRoundId, 0, "Non-zero roundId");
        assertEq(wstethAnsweredInRound, 0, "Non-zero roundData");

        uint256 wstETHCreationTimestamp = 1613752640; // Feb 19, 2021
        uint256 timePassed = block.timestamp - wstETHCreationTimestamp;
        uint256 maxDeviationPer365DaysInBps = 6 * BPS_ONE_PERCENT;

        // 1 WSTETH value must be always greater than 1 ETH
        assertGt(uint256(wstethAnswer), 1 ether, "Value too low");
        assertLe(
            uint256(wstethAnswer),
            1 ether + (1 ether * maxDeviationPer365DaysInBps * timePassed) / (365 days * BPS_ONE_HUNDRED_PERCENT),
            "Deviation too high"
        );
    }

    function test_latestRoundData_successWithAlteredRates() public {
        // Mock return values of stETH and wstETH sources to be:
        // - eth-per-steth rate is 5e18
        // - steth-per-wsteth rate is 2e18
        // Expected eth-per-wsteth rate: 10e18
        uint256 ethPerStethRate = 5e18;
        uint256 stethPerWstethRate = 2e18;
        uint256 expectedEthPerWstethRate = 10e18;

        // Mock call on the Chainlink aggregator
        vm.mockCall({
            callee: address(originalStethEthAggregator),
            data: abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
            returnData: abi.encode(1, ethPerStethRate, 345, 456, 2)
        });

        // Mock call in stETH
        vm.mockCall({
            callee: ETHEREUM_STETH,
            data: abi.encodeWithSelector(ILidoSteth.getPooledEthByShares.selector, assetUnit(IERC20(ETHEREUM_WSTETH))),
            returnData: abi.encode(stethPerWstethRate)
        });

        (, int256 wstethAnswer,,,) = wstethAggregator.latestRoundData();
        assertEq(uint256(wstethAnswer), expectedEthPerWstethRate, "Incorrect rate");
    }
}

contract ChainlinkLikeWstethPriceFeedTestEthereum is ChainlinkLikeWstethPriceFeedTest {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ChainlinkLikeWstethPriceFeedTestEthereumV4 is ChainlinkLikeWstethPriceFeedTest {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

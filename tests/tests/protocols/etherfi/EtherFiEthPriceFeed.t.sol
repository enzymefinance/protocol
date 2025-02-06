// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IEtherFiEthPriceFeed} from "tests/interfaces/internal/IEtherFiEthPriceFeed.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

address constant ETHERFI_ETH_ADDRESS = 0x35fA164735182de50811E8e2E824cFb9B6118ac2;
address constant WRAPPED_ETHERFI_ETH_ADDRESS = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;
address constant WRAPPED_ETHERFI_ETH_AGGREGATOR = 0x8751F736E94F6CD167e8C5B97E245680FbD9CC36;

abstract contract EtherFiEthPriceFeedTestBase is IntegrationTest {
    IEtherFiEthPriceFeed internal priceFeed;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();
        version = _version;
        priceFeed = __deployPriceFeed();
    }

    function __reinitialize(uint256 _forkBlock) private {
        setUpMainnetEnvironment(_forkBlock);
        priceFeed = __deployPriceFeed();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() private returns (IEtherFiEthPriceFeed) {
        address addr =
            deployCode("EtherFiEthPriceFeed.sol", abi.encode(ETHERFI_ETH_ADDRESS, WRAPPED_ETHERFI_ETH_ADDRESS));
        return IEtherFiEthPriceFeed(addr);
    }

    // MISC HELPERS

    function __addDerivativeAndUnderlying() private {
        addPrimitive({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: WRAPPED_ETHERFI_ETH_ADDRESS,
            _skipIfRegistered: false,
            _aggregatorAddress: ETHEREUM_WEETH_ETH_AGGREGATOR,
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH
        });
        addDerivative({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: ETHERFI_ETH_ADDRESS,
            _skipIfRegistered: false,
            _priceFeedAddress: address(priceFeed)
        });
    }

    // TESTS

    function test_calcUnderlyingValuesForSpecificBlock_success() public {
        __reinitialize(ETHEREUM_BLOCK_TIME_SENSITIVE); // roll the fork block, and re-deploy

        __addDerivativeAndUnderlying();

        // EETH/USD price Jan 26th 2025 https://www.coingecko.com/en/coins/ether-fi-staked-eth/historical_data
        assertValueInUSDForVersion({
            _version: version,
            _asset: ETHERFI_ETH_ADDRESS,
            _amount: assetUnit(IERC20(ETHERFI_ETH_ADDRESS)),
            _expected: 3311752649257491376322 // 3311.752649257491376322 USD
        });
    }

    function test_calcUnderlyingValuesInvariant_success() public {
        __addDerivativeAndUnderlying();

        uint256 eETHvalue = IValueInterpreter(getValueInterpreterAddressForVersion(version)).calcCanonicalAssetValue({
            _baseAsset: ETHERFI_ETH_ADDRESS,
            _amount: assetUnit(IERC20(ETHERFI_ETH_ADDRESS)),
            _quoteAsset: address(wethToken)
        });

        // eETH should be worth approximately 1ETH
        assertApproxEqRel(eETHvalue, assetUnit(wethToken), WEI_ONE_PERCENT / 5);
    }

    function test_isSupportedAsset_success() public {
        assertTrue(priceFeed.isSupportedAsset({_asset: ETHERFI_ETH_ADDRESS}), "Unsupported asset");
    }

    function test_isSupportedAsset_successWithUnsupportedAsset() public {
        assertFalse(priceFeed.isSupportedAsset({_asset: makeAddr("RandomToken")}), "Incorrectly supported asset");
    }
}

contract EtherFiEthPriceFeedTestEthereum is EtherFiEthPriceFeedTestBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract EtherFiEthPriceFeedTestEthereumV4 is EtherFiEthPriceFeedTestBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC4626} from "openzeppelin-solc-0.8/token/ERC20/extensions/ERC4626.sol";

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IERC4626PriceFeed} from "tests/interfaces/internal/IERC4626PriceFeed.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

import {ETHEREUM_MORPHO_RE7_USDC_VAULT_ADDRESS, ETHEREUM_SPARK_SDAI_VAULT_ADDRESS} from "./ERC4626Utils.sol";

abstract contract ERC4626PriceFeedTestBase is IntegrationTest {
    IERC4626PriceFeed internal priceFeed;
    IERC4626 internal erc4626Vault;
    IERC20 internal underlying;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version, uint256 _chainId) internal {
        setUpNetworkEnvironment(_chainId);
        priceFeed = __deployPriceFeed();
        version = _version;
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() private returns (IERC4626PriceFeed) {
        address addr = deployCode("ERC4626PriceFeed.sol");
        return IERC4626PriceFeed(addr);
    }

    // TESTS

    function __test_calcUnderlyingValues_success(
        address _erc4626VaultAddress,
        uint256 _allowedDeviationPer365DaysInBps,
        uint256 _poolCreationTimestamp
    ) internal {
        addDerivative({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: _erc4626VaultAddress,
            _skipIfRegistered: false,
            _priceFeedAddress: address(priceFeed)
        });

        address underlyingAddress = IERC4626(_erc4626VaultAddress).asset();

        uint256 erc4626VaultValue = IValueInterpreter(getValueInterpreterAddressForVersion(version))
            .calcCanonicalAssetValue({
            _baseAsset: _erc4626VaultAddress,
            _amount: assetUnit(IERC20(_erc4626VaultAddress)),
            _quoteAsset: underlyingAddress
        });

        uint256 underlyingSingleUnit = assetUnit(IERC20(underlyingAddress));
        uint256 timePassed = block.timestamp - _poolCreationTimestamp;

        assertGe(erc4626VaultValue, underlyingSingleUnit, "Value too low");
        assertLe(
            erc4626VaultValue,
            underlyingSingleUnit
                + (underlyingSingleUnit * _allowedDeviationPer365DaysInBps * timePassed)
                    / (365 days * BPS_ONE_HUNDRED_PERCENT),
            "Deviation too high"
        );
    }

    function __test_isSupportedAsset_success(address _erc4626VaultAddress) internal {
        assertTrue(priceFeed.isSupportedAsset({_asset: _erc4626VaultAddress}), "Unsupported erc4626 token");
    }

    function test_isSupportedAsset_failWithoutExpectedInterface() public {
        vm.expectRevert();
        priceFeed.isSupportedAsset({_asset: makeAddr("Unsupported Address")});
    }
}

abstract contract ERC4626PriceFeedTestEthereumBase is ERC4626PriceFeedTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({_version: _version, _chainId: ETHEREUM_CHAIN_ID});
    }

    function test_calcUnderlyingValues_successMetaMorpho() public {
        __test_calcUnderlyingValues_success({
            _erc4626VaultAddress: ETHEREUM_MORPHO_RE7_USDC_VAULT_ADDRESS,
            _allowedDeviationPer365DaysInBps: 3 * BPS_ONE_PERCENT,
            _poolCreationTimestamp: 1705697315
        });
    }

    function test_calcUnderlyingValues_successSpark() public {
        __test_calcUnderlyingValues_success({
            _erc4626VaultAddress: ETHEREUM_SPARK_SDAI_VAULT_ADDRESS,
            _allowedDeviationPer365DaysInBps: 7 * BPS_ONE_PERCENT,
            _poolCreationTimestamp: 1673977931
        });
    }
}

contract ERC4626PriceFeedTestEthereum is ERC4626PriceFeedTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ERC4626PriceFeedTestEthereumV4 is ERC4626PriceFeedTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

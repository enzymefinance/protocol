// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC4626} from "openzeppelin-solc-0.8/token/ERC20/extensions/ERC4626.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IERC4626PriceFeed} from "tests/interfaces/internal/IERC4626PriceFeed.sol";
import {
    ETHEREUM_MORPHO_MAWETH_VAULT_ADDRESS,
    ETHEREUM_MORPHO_MA3WETH_VAULT_ADDRESS,
    ETHEREUM_MORPHO_MCWETH_VAULT_ADDRESS,
    ETHEREUM_SPARK_SDAI_VAULT_ADDRESS
} from "./ERC4626Utils.sol";

abstract contract ERC4626PriceFeedTestBase is IntegrationTest {
    IERC4626PriceFeed internal erc4626PriceFeed;
    IERC4626 internal erc4626Vault;
    IERC20 internal underlying;

    function setUp(address _erc4626VaultAddress) internal {
        erc4626PriceFeed = __deployPriceFeed();
        erc4626Vault = IERC4626(_erc4626VaultAddress);
        underlying = IERC20(erc4626Vault.asset());
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() private returns (IERC4626PriceFeed) {
        address addr = deployCode("ERC4626PriceFeed.sol");
        return IERC4626PriceFeed(addr);
    }

    function test_calcUnderlyingValues_success() public {
        uint256 derivativeAmount = assetUnit({_asset: IERC20(address(erc4626Vault))}) * 3;
        uint256 expectedUnderlyingValue = erc4626Vault.convertToAssets({shares: derivativeAmount});

        (address[] memory underlyingAddresses, uint256[] memory underlyingValues) = erc4626PriceFeed
            .calcUnderlyingValues({_derivative: address(erc4626Vault), _derivativeAmount: derivativeAmount});

        assertEq(
            toArray(address(underlying)), underlyingAddresses, "Mismatch between actual and expected underlying address"
        );
        assertEq(
            toArray(expectedUnderlyingValue), underlyingValues, "Mismatch between actual and expected underlying value"
        );
    }

    function test_isSupportedAsset_success() public {
        assertTrue(erc4626PriceFeed.isSupportedAsset({_asset: address(erc4626Vault)}), "Unsupported erc4626 token");
    }

    function test_isSupportedAsset_failWithUnsupportedAsset() public {
        vm.expectRevert();
        assertFalse(erc4626PriceFeed.isSupportedAsset({_asset: address(underlying)}), "Supported non-erc4626 token");
    }
}

contract MorphoAaveV2Test is ERC4626PriceFeedTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_MORPHO_MAWETH_VAULT_ADDRESS);
    }
}

contract MorphoAaveV3Test is ERC4626PriceFeedTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_MORPHO_MA3WETH_VAULT_ADDRESS);
    }
}

contract MorphoCompoundTest is ERC4626PriceFeedTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_MORPHO_MCWETH_VAULT_ADDRESS);
    }
}

contract SparkTest is ERC4626PriceFeedTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_SPARK_SDAI_VAULT_ADDRESS);
    }
}

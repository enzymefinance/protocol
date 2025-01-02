// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IPeggedDerivativesPriceFeed} from "tests/interfaces/internal/IPeggedDerivativesPriceFeed.sol";

abstract contract PeggedDerivativesPriceFeedTestBase is IntegrationTest {
    event DerivativeAdded(address indexed derivative, address indexed underlying);

    event DerivativeRemoved(address indexed derivative);

    IPeggedDerivativesPriceFeed internal priceFeed;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version, uint256 _chainId) internal {
        setUpNetworkEnvironment(_chainId);
        version = _version;
        priceFeed = __deployPriceFeed();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() private returns (IPeggedDerivativesPriceFeed priceFeed_) {
        address addr =
            deployCode("PeggedDerivativesPriceFeed.sol", abi.encode(getFundDeployerAddressForVersion(version)));
        return IPeggedDerivativesPriceFeed(addr);
    }

    // TEST HELPERS

    function __prankFundDeployerOwner() internal {
        vm.prank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());
    }

    // TESTS

    function test_calcUnderlyingValues_success() public {
        address fakeTokenDerivative = address(createTestToken({_decimals: 7, _symbol: "FKD", _name: "FAKED"}));
        address fakeTokenUnderlying = address(createTestToken({_decimals: 7, _symbol: "FKU", _name: "FAKEU"}));

        __prankFundDeployerOwner();
        priceFeed.addDerivatives({
            _derivatives: toArray(fakeTokenDerivative),
            _underlyings: toArray(fakeTokenUnderlying)
        });

        uint256 derivativeAmount = assetUnit(IERC20(fakeTokenDerivative)) * 3;
        uint256 expectedUnderlyingValue = derivativeAmount;

        (address[] memory underlyingAddresses, uint256[] memory underlyingValues) =
            priceFeed.calcUnderlyingValues({_derivative: fakeTokenDerivative, _derivativeAmount: derivativeAmount});

        assertEq(
            toArray(fakeTokenUnderlying), underlyingAddresses, "Mismatch between actual and expected underlying address"
        );
        assertEq(
            toArray(expectedUnderlyingValue), underlyingValues, "Mismatch between actual and expected underlying value"
        );
    }

    function test_calcUnderlyingValues_failsUnsupportedDerivative() public {
        vm.expectRevert("calcUnderlyingValues: Not a supported derivative");
        priceFeed.calcUnderlyingValues({_derivative: makeAddr("fake token"), _derivativeAmount: 1});
    }

    function test_addDerivatives_success() public {
        address fakeTokenDerivative = address(createTestToken({_decimals: 7, _symbol: "FKD", _name: "FAKED"}));
        address fakeTokenUnderlying = address(createTestToken({_decimals: 7, _symbol: "FKU", _name: "FAKEU"}));

        assertFalse(priceFeed.isSupportedAsset({_asset: fakeTokenDerivative}), "Supported token");

        __prankFundDeployerOwner();

        expectEmit(address(priceFeed));
        emit DerivativeAdded(fakeTokenDerivative, fakeTokenUnderlying);

        priceFeed.addDerivatives({
            _derivatives: toArray(fakeTokenDerivative),
            _underlyings: toArray(fakeTokenUnderlying)
        });

        assertTrue(priceFeed.isSupportedAsset({_asset: fakeTokenDerivative}), "Unsupported token");
    }

    function test_addDerivatives_failsEmptyDerivativesAndUnderlyings() public {
        __prankFundDeployerOwner();
        vm.expectRevert("addDerivatives: Empty _derivatives");
        priceFeed.addDerivatives({_derivatives: new address[](0), _underlyings: new address[](0)});
    }

    function test_addDerivatives_failsUnequalArrays() public {
        __prankFundDeployerOwner();
        vm.expectRevert("addDerivatives: Unequal arrays");
        priceFeed.addDerivatives({_derivatives: toArray(makeAddr("fake token")), _underlyings: new address[](0)});
    }

    function test_addDerivatives_failsZeroAddressDerivative() public {
        __prankFundDeployerOwner();
        vm.expectRevert("addDerivatives: Empty derivative");
        priceFeed.addDerivatives({_derivatives: toArray(address(0)), _underlyings: toArray(makeAddr("fake token"))});
    }

    function test_addDerivatives_failsZeroAddressUnderlying() public {
        __prankFundDeployerOwner();
        vm.expectRevert("addDerivatives: Empty underlying");
        priceFeed.addDerivatives({_derivatives: toArray(makeAddr("fake token")), _underlyings: toArray(address(0))});
    }

    function test_addDerivatives_failsValueAlreadySet() public {
        address fakeTokenDerivative = address(createTestToken({_decimals: 7, _symbol: "FKD", _name: "FAKED"}));
        address fakeTokenUnderlying = address(createTestToken({_decimals: 7, _symbol: "FKU", _name: "FAKEU"}));

        __prankFundDeployerOwner();
        priceFeed.addDerivatives({
            _derivatives: toArray(fakeTokenDerivative),
            _underlyings: toArray(fakeTokenUnderlying)
        });

        __prankFundDeployerOwner();
        vm.expectRevert("addDerivatives: Value already set");
        priceFeed.addDerivatives({
            _derivatives: toArray(fakeTokenDerivative),
            _underlyings: toArray(makeAddr("fake token"))
        });
    }

    function test_addDerivatives_failsUnequalDecimals() public {
        address fakeTokenDerivative = address(createTestToken({_decimals: 7, _symbol: "FKD", _name: "FAKED"}));
        address fakeTokenUnderlying = address(createTestToken({_decimals: 9, _symbol: "FKU", _name: "FAKEU"}));

        assertFalse(priceFeed.isSupportedAsset({_asset: fakeTokenDerivative}), "Supported token");

        __prankFundDeployerOwner();
        vm.expectRevert("__validateDerivative: Unequal decimals");
        priceFeed.addDerivatives({
            _derivatives: toArray(fakeTokenDerivative),
            _underlyings: toArray(fakeTokenUnderlying)
        });
    }

    function test_removeDerivatives_success() public {
        address fakeTokenDerivative = address(createTestToken({_decimals: 7, _symbol: "FKD", _name: "FAKED"}));
        address fakeTokenUnderlying = address(createTestToken({_decimals: 7, _symbol: "FKU", _name: "FAKEU"}));

        __prankFundDeployerOwner();
        priceFeed.addDerivatives({
            _derivatives: toArray(fakeTokenDerivative),
            _underlyings: toArray(fakeTokenUnderlying)
        });

        assertTrue(priceFeed.isSupportedAsset({_asset: fakeTokenDerivative}), "Unsupported token");

        __prankFundDeployerOwner();
        expectEmit(address(priceFeed));
        emit DerivativeRemoved(fakeTokenDerivative);
        priceFeed.removeDerivatives({_derivatives: toArray(fakeTokenDerivative)});

        assertFalse(priceFeed.isSupportedAsset({_asset: fakeTokenDerivative}), "Supported token");
    }

    function test_removeDerivatives_failsEmptyDerivatives() public {
        __prankFundDeployerOwner();
        vm.expectRevert("removeDerivatives: Empty _derivatives");
        priceFeed.removeDerivatives({_derivatives: new address[](0)});
    }

    function test_removeDerivatives_failsValueNotSet() public {
        __prankFundDeployerOwner();
        vm.expectRevert("removeDerivatives: Value not set");
        priceFeed.removeDerivatives({_derivatives: toArray(makeAddr("fake token"))});
    }
}

contract PeggedDerivativesPriceFeedTestEthereum is PeggedDerivativesPriceFeedTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current, _chainId: ETHEREUM_CHAIN_ID});
    }
}

contract PeggedDerivativesPriceFeedTestEthereumV4 is PeggedDerivativesPriceFeedTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4, _chainId: ETHEREUM_CHAIN_ID});
    }
}

contract PeggedDerivativesPriceFeedTestPolygon is PeggedDerivativesPriceFeedTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current, _chainId: POLYGON_CHAIN_ID});
    }
}

contract PeggedDerivativesPriceFeedTestPolygonV4 is PeggedDerivativesPriceFeedTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4, _chainId: POLYGON_CHAIN_ID});
    }
}

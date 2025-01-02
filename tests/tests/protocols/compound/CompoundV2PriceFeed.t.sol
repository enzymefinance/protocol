// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {ICompoundV2CERC20} from "tests/interfaces/external/ICompoundV2CERC20.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {ICompoundPriceFeed} from "tests/interfaces/internal/ICompoundPriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";

uint256 constant CTOKEN_RATE_DIVISOR = 1e18;

abstract contract CompoundV2PriceFeedTestBase is IntegrationTest {
    event CTokenAdded(address indexed cToken, address indexed token);

    ICompoundPriceFeed internal priceFeed;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();
        version = _version;
        priceFeed = __deployPriceFeed();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() private returns (ICompoundPriceFeed priceFeed_) {
        address addr = deployCode(
            "CompoundPriceFeed.sol",
            abi.encode(getFundDeployerAddressForVersion(version), ETHEREUM_WETH, ETHEREUM_COMPOUND_V2_CETH)
        );
        return ICompoundPriceFeed(addr);
    }

    // MIST HELPERS

    function __getCTokenUnderlying(ICompoundV2CERC20 _cToken) internal returns (address underlying_) {
        return address(_cToken) == ETHEREUM_COMPOUND_V2_CETH ? ETHEREUM_WETH : _cToken.underlying();
    }

    // TEST HELPERS

    function __test_calcUnderlyingValues_success(address _derivative, uint256 _derivativeAmount) internal {
        uint256 expectedUnderlyingValue =
            _derivativeAmount * ICompoundV2CERC20(_derivative).exchangeRateStored() / CTOKEN_RATE_DIVISOR;

        (address[] memory underlyingAddresses, uint256[] memory underlyingValues) =
            priceFeed.calcUnderlyingValues({_derivative: _derivative, _derivativeAmount: _derivativeAmount});

        assertEq(
            toArray(__getCTokenUnderlying(ICompoundV2CERC20(_derivative))),
            underlyingAddresses,
            "Mismatch between actual and expected underlying address"
        );
        assertEq(
            toArray(expectedUnderlyingValue), underlyingValues, "Mismatch between actual and expected underlying value"
        );
    }

    // TESTS

    function test_calcUnderlyingValues_successCETH() public {
        __test_calcUnderlyingValues_success({
            _derivative: ETHEREUM_COMPOUND_V2_CETH,
            _derivativeAmount: 12 * assetUnit(IERC20(ETHEREUM_COMPOUND_V2_CETH))
        });
    }

    function test_calcUnderlyingValues_successRegularAsset() public {
        vm.prank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());
        priceFeed.addCTokens(toArray(ETHEREUM_COMPOUND_V2_CUSDC));

        __test_calcUnderlyingValues_success({
            _derivative: ETHEREUM_COMPOUND_V2_CUSDC,
            _derivativeAmount: 17 * assetUnit(IERC20(ETHEREUM_COMPOUND_V2_CUSDC))
        });
    }

    function test_calcUnderlyingValues_failsUnsupportedDerivative() public {
        vm.expectRevert("calcUnderlyingValues: Unsupported derivative");
        priceFeed.calcUnderlyingValues({_derivative: makeAddr("fake token"), _derivativeAmount: 1});
    }

    function test_isSupportedAsset_successCETH() public {
        assertTrue(priceFeed.isSupportedAsset({_asset: ETHEREUM_COMPOUND_V2_CETH}), "Unsupported cETH token");
    }

    function test_isSupportedAsset_successRegularAssets() public {
        assertFalse(priceFeed.isSupportedAsset({_asset: ETHEREUM_COMPOUND_V2_CUSDC}), "Supported token");

        vm.prank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());

        expectEmit(address(priceFeed));
        emit CTokenAdded(ETHEREUM_COMPOUND_V2_CUSDC, ETHEREUM_USDC);

        priceFeed.addCTokens(toArray(ETHEREUM_COMPOUND_V2_CUSDC));

        assertTrue(priceFeed.isSupportedAsset({_asset: ETHEREUM_COMPOUND_V2_CUSDC}), "Unsupported token");
    }

    function test_addCTokens_failsEmptyArray() public {
        vm.prank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());

        vm.expectRevert("addCTokens: Empty _cTokens");
        priceFeed.addCTokens(new address[](0));
    }

    function test_addCTokens_failsValueAlreadySet() public {
        vm.prank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());

        vm.expectRevert("addCTokens: Value already set");
        priceFeed.addCTokens(toArray(ETHEREUM_COMPOUND_V2_CETH));
    }
}

contract CompoundV2PriceFeedTestEthereum is CompoundV2PriceFeedTestBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract CompoundV2PriceFeedTestEthereumV4 is CompoundV2PriceFeedTestBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

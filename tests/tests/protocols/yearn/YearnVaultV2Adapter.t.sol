// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IYearnVaultV2Vault} from "tests/interfaces/external/IYearnVaultV2Vault.sol";

import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IYearnVaultV2Adapter} from "tests/interfaces/internal/IYearnVaultV2Adapter.sol";
import {IYearnVaultV2PriceFeed} from "tests/interfaces/internal/IYearnVaultV2PriceFeed.sol";

import {
    ETHEREUM_YEARN_VAULT_V2_REGISTRY,
    ETHEREUM_YEARN_VAULT_V2_USDT_VAULT,
    ETHEREUM_YEARN_VAULT_V2_WETH_VAULT
} from "./YearnVaultV2Contants.sol";

abstract contract YearnVaultV2AdapterTestBase is IntegrationTest {
    address internal vaultOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IYearnVaultV2Adapter internal adapter;
    IYearnVaultV2PriceFeed internal priceFeed;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version, address _yearnVaultV2RegistryAddress, uint256 _chainId) internal {
        version = _version;
        setUpNetworkEnvironment({_chainId: _chainId});

        (comptrollerProxyAddress, vaultProxyAddress, vaultOwner) = createTradingFundForVersion(version);

        priceFeed = __deployYearnVaultV2PriceFeed({
            _fundDeployerAddress: getFundDeployerAddressForVersion(version),
            _yearnVaultV2RegistryAddress: _yearnVaultV2RegistryAddress
        });

        adapter = __deployAdapter({
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(version),
            _priceFeed: priceFeed
        });
    }

    // DEPLOYMENT HELPERS
    function __deployAdapter(address _integrationManagerAddress, IYearnVaultV2PriceFeed _priceFeed)
        internal
        returns (IYearnVaultV2Adapter adapter_)
    {
        bytes memory args = abi.encode(_integrationManagerAddress, _priceFeed);
        return IYearnVaultV2Adapter(deployCode("YearnVaultV2Adapter.sol", args));
    }

    function __deployYearnVaultV2PriceFeed(address _fundDeployerAddress, address _yearnVaultV2RegistryAddress)
        internal
        returns (IYearnVaultV2PriceFeed priceFeed_)
    {
        bytes memory args = abi.encode(_fundDeployerAddress, _yearnVaultV2RegistryAddress);
        return IYearnVaultV2PriceFeed(deployCode("YearnVaultV2PriceFeed.sol", args));
    }

    // ACTION HELPERS

    function __lend(address _yVaultAddress, uint256 _outgoingUnderlyingAmount, uint256 _minIncomingYVaultSharesAmount)
        internal
    {
        bytes memory actionArgs = abi.encode(_yVaultAddress, _outgoingUnderlyingAmount, _minIncomingYVaultSharesAmount);

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: IYearnVaultV2Adapter.lend.selector,
            _actionArgs: actionArgs
        });
    }

    function __redeem(
        address _yVaultAddress,
        uint256 _maxOutgoingYVaultSharesAmount,
        uint256 _minIncomingUnderlyingAmount,
        uint256 _slippageToleranceBps
    ) internal {
        bytes memory actionArgs = abi.encode(
            _yVaultAddress, _maxOutgoingYVaultSharesAmount, _minIncomingUnderlyingAmount, _slippageToleranceBps
        );

        vm.prank(vaultOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: IYearnVaultV2Adapter.redeem.selector,
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __registerYVault(address _yVaultAddress) internal {
        vm.startPrank(IFundDeployer(getFundDeployerAddressForVersion(version)).getOwner());
        priceFeed.addDerivatives({
            _derivatives: toArray(_yVaultAddress),
            _underlyings: toArray(address(IYearnVaultV2Vault(_yVaultAddress).token()))
        });
        vm.stopPrank();

        addDerivative({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: _yVaultAddress,
            _skipIfRegistered: true,
            _priceFeedAddress: address(priceFeed)
        });
    }

    // TESTS
    function __test_lend_success(address _yVaultAddress, uint256 _outgoingUnderlyingAmount) internal {
        // register incoming asset, so the asset can be accepted by the vault
        __registerYVault(_yVaultAddress);

        IERC20 underlying = IYearnVaultV2Vault(_yVaultAddress).token();

        increaseTokenBalance({_token: underlying, _to: vaultProxyAddress, _amount: _outgoingUnderlyingAmount * 3}); // multiply by 3 to test underlying balance after lend with non-zero value

        uint256 yVaultSharesBefore = IERC20(_yVaultAddress).balanceOf(vaultProxyAddress);
        uint256 preLendUnderlyingBalance = underlying.balanceOf(vaultProxyAddress);

        uint256 estimatedIncomingYVaultSharesAmount =
            _outgoingUnderlyingAmount * 10 ** underlying.decimals() / IYearnVaultV2Vault(_yVaultAddress).pricePerShare();

        uint256 minIncomingYVaultSharesAmount = estimatedIncomingYVaultSharesAmount * 999 / 1000; // 0.1% slippage, cause price moves slightly when we deposit

        vm.recordLogs();

        __lend({
            _yVaultAddress: _yVaultAddress,
            _outgoingUnderlyingAmount: _outgoingUnderlyingAmount,
            _minIncomingYVaultSharesAmount: minIncomingYVaultSharesAmount
        });

        // test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(underlying)),
            _maxSpendAssetAmounts: toArray(_outgoingUnderlyingAmount),
            _incomingAssets: toArray(_yVaultAddress),
            _minIncomingAssetAmounts: toArray(minIncomingYVaultSharesAmount)
        });

        uint256 yVaultSharesAfter = IERC20(_yVaultAddress).balanceOf(vaultProxyAddress);
        uint256 postLendUnderlyingBalance = underlying.balanceOf(vaultProxyAddress);

        assertApproxEqRel(
            yVaultSharesAfter,
            yVaultSharesBefore + estimatedIncomingYVaultSharesAmount,
            WEI_ONE_PERCENT / 10,
            "Incorrect yVault shares amount"
        );
        assertEq(
            postLendUnderlyingBalance,
            preLendUnderlyingBalance - _outgoingUnderlyingAmount,
            "Incorrect underlying balance"
        );
    }

    function test_lend_failsUnsupportedYVault() public {
        vm.expectRevert("__parseAssetsForLend: Unsupported yVault");

        __lend({
            _yVaultAddress: makeAddr("fake yVault"),
            _outgoingUnderlyingAmount: 1,
            _minIncomingYVaultSharesAmount: 1
        });
    }

    function __test_redeem_success(address _yVaultAddress, uint256 _maxOutgoingYVaultSharesAmount) internal {
        // register vault so __parseAssetsForRedeem passes
        __registerYVault(_yVaultAddress);

        increaseTokenBalance({
            _token: IERC20(_yVaultAddress),
            _to: vaultProxyAddress,
            _amount: _maxOutgoingYVaultSharesAmount * 3
        }); // multiply by 3 to test balance after redeem with non-zero value

        IERC20 underlying = IYearnVaultV2Vault(_yVaultAddress).token();

        uint256 yVaultSharesBefore = IERC20(_yVaultAddress).balanceOf(vaultProxyAddress);
        uint256 preRedeemUnderlyingBalance = underlying.balanceOf(vaultProxyAddress);

        uint256 estimatedIncomingUnderlyingAmount = _maxOutgoingYVaultSharesAmount
            * IYearnVaultV2Vault(_yVaultAddress).pricePerShare() / 10 ** underlying.decimals();

        uint256 minIncomingUnderlyingAmount = estimatedIncomingUnderlyingAmount * 999 / 1000; // 0.1% slippage, cause price moves slightly when we redeeming

        vm.recordLogs();

        __redeem({
            _yVaultAddress: _yVaultAddress,
            _maxOutgoingYVaultSharesAmount: _maxOutgoingYVaultSharesAmount,
            _minIncomingUnderlyingAmount: minIncomingUnderlyingAmount,
            _slippageToleranceBps: 10 // 0.1%
        });

        // test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(_yVaultAddress),
            _maxSpendAssetAmounts: toArray(_maxOutgoingYVaultSharesAmount),
            _incomingAssets: toArray(address(underlying)),
            _minIncomingAssetAmounts: toArray(minIncomingUnderlyingAmount)
        });

        uint256 yVaultSharesAfter = IERC20(_yVaultAddress).balanceOf(vaultProxyAddress);
        uint256 postRedeemUnderlyingBalance = underlying.balanceOf(vaultProxyAddress);

        assertEq(
            yVaultSharesAfter, yVaultSharesBefore - _maxOutgoingYVaultSharesAmount, "Incorrect yVault shares amount"
        );
        assertApproxEqRel(
            postRedeemUnderlyingBalance,
            preRedeemUnderlyingBalance + estimatedIncomingUnderlyingAmount,
            WEI_ONE_PERCENT / 10,
            "Incorrect underlying balance"
        );
    }

    function test_redeem_failsUnsupportedYVault() public {
        vm.expectRevert("__parseAssetsForRedeem: Unsupported yVault");

        __redeem({
            _yVaultAddress: makeAddr("fake yVault"),
            _maxOutgoingYVaultSharesAmount: 1,
            _minIncomingUnderlyingAmount: 1,
            _slippageToleranceBps: 1
        });
    }
}

abstract contract YearnVaultV2AdapterTestBaseEthereum is YearnVaultV2AdapterTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _yearnVaultV2RegistryAddress: ETHEREUM_YEARN_VAULT_V2_REGISTRY,
            _chainId: ETHEREUM_CHAIN_ID
        });
    }

    function test_lend_success() public {
        // test with 18 decimals asset
        __test_lend_success({
            _yVaultAddress: ETHEREUM_YEARN_VAULT_V2_WETH_VAULT,
            _outgoingUnderlyingAmount: 16 * assetUnit(IYearnVaultV2Vault(ETHEREUM_YEARN_VAULT_V2_WETH_VAULT).token())
        });

        // test with non-18 decimals asset, USDT has 6 decimals
        __test_lend_success({
            _yVaultAddress: ETHEREUM_YEARN_VAULT_V2_USDT_VAULT,
            _outgoingUnderlyingAmount: 21 * assetUnit(IYearnVaultV2Vault(ETHEREUM_YEARN_VAULT_V2_USDT_VAULT).token())
        });
    }

    function test_redeem_success() public {
        // test with 18 decimals asset
        __test_redeem_success({
            _yVaultAddress: ETHEREUM_YEARN_VAULT_V2_WETH_VAULT,
            _maxOutgoingYVaultSharesAmount: 13 * assetUnit(IYearnVaultV2Vault(ETHEREUM_YEARN_VAULT_V2_WETH_VAULT).token())
        });

        // test with non-18 decimals asset, USDT has 6 decimals
        __test_redeem_success({
            _yVaultAddress: ETHEREUM_YEARN_VAULT_V2_USDT_VAULT,
            _maxOutgoingYVaultSharesAmount: 19 * assetUnit(IYearnVaultV2Vault(ETHEREUM_YEARN_VAULT_V2_USDT_VAULT).token())
        });
    }
}

contract YearnVaultV2AdapterTestEthereum is YearnVaultV2AdapterTestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract YearnVaultV2AdapterTestEthereumV4 is YearnVaultV2AdapterTestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

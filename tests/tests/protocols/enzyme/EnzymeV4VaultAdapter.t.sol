// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {
    IEnzymeV4VaultAdapter as IEnzymeV4VaultAdapterProd
} from "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IEnzymeV4VaultAdapter.sol";
import {
    IIntegrationManager as IIntegrationManagerProd
} from "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IEnzymeV4VaultAdapter} from "tests/interfaces/internal/IEnzymeV4VaultAdapter.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract EnzymeV4VaultAdapterTesBase is IntegrationTest {
    address internal parentVaultComptrollerProxyAddress;
    address internal parentVaultFundOwner;
    address internal parentVaultProxyAddress;

    address internal childVaultComptrollerProxyAddress;
    address internal childVaultDenominationAsset;
    address internal childVaultFundOwner;
    address internal childVaultProxyAddress;

    IEnzymeV4VaultAdapter internal adapter;

    function __initialize() internal {
        IComptrollerLib parentComptrollerProxy;
        IVaultLib parentVaultProxy;
        (parentComptrollerProxy, parentVaultProxy, parentVaultFundOwner) =
            createFundMinimal({_fundDeployer: core.release.fundDeployer});
        parentVaultComptrollerProxyAddress = address(parentComptrollerProxy);
        parentVaultProxyAddress = address(parentVaultProxy);

        IComptrollerLib childComptrollerProxy;
        IVaultLib childVaultProxy;
        (childComptrollerProxy, childVaultProxy, childVaultFundOwner) =
            createFundMinimal({_fundDeployer: core.release.fundDeployer});
        childVaultComptrollerProxyAddress = address(childComptrollerProxy);
        childVaultProxyAddress = address(childVaultProxy);
        childVaultDenominationAsset = IComptrollerLib(childVaultComptrollerProxyAddress).getDenominationAsset();

        adapter = __deployAdapter();
    }

    //==================================================================================================================
    // Deployment helpers
    //==================================================================================================================

    function __deployAdapter() private returns (IEnzymeV4VaultAdapter adapter_) {
        bytes memory args = abi.encode(
            address(core.release.integrationManager), address(core.release.fundDeployer), core.persistent.dispatcher
        );
        return IEnzymeV4VaultAdapter(deployCode("EnzymeV4VaultAdapter.sol", args));
    }

    //==================================================================================================================
    // Action helpers
    //==================================================================================================================

    function __action(IEnzymeV4VaultAdapterProd.Action _actionId, bytes memory _encodedActionArgs) internal {
        bytes memory actionArgs = abi.encode(_actionId, _encodedActionArgs);

        vm.prank(parentVaultFundOwner);
        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: IComptrollerLib(parentVaultComptrollerProxyAddress),
            _adapter: address(adapter),
            _selector: IEnzymeV4VaultAdapter.action.selector,
            _actionArgs: actionArgs
        });
    }

    function __buyShares(IEnzymeV4VaultAdapterProd.BuySharesActionArgs memory _args) internal {
        __action(IEnzymeV4VaultAdapterProd.Action.BuyShares, abi.encode(_args));
    }

    function __redeemSharesForSpecificAssets(
        IEnzymeV4VaultAdapterProd.RedeemSharesForSpecificAssetsActionArgs memory _args
    ) internal {
        __action(IEnzymeV4VaultAdapterProd.Action.RedeemSharesForSpecificAssets, abi.encode(_args));
    }

    //==================================================================================================================
    // Tests
    //==================================================================================================================

    function test_buyShares_success() public {
        // register childVaultProxyAddress so it can be received as an incoming asset
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: childVaultProxyAddress,
            _skipIfRegistered: false
        });

        uint256 investmentAmount = assetUnit(IERC20(childVaultDenominationAsset));

        IEnzymeV4VaultAdapterProd.BuySharesActionArgs memory args = IEnzymeV4VaultAdapterProd.BuySharesActionArgs({
            vaultProxy: childVaultProxyAddress, investmentAmount: investmentAmount, minSharesQuantity: 1
        });

        increaseTokenBalance({
            _token: IERC20(childVaultDenominationAsset), _to: parentVaultProxyAddress, _amount: investmentAmount
        });

        uint256 preInvestmentBalance = IERC20(childVaultDenominationAsset).balanceOf(parentVaultProxyAddress);

        vm.recordLogs();

        __buyShares(args);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(childVaultDenominationAsset),
            _maxSpendAssetAmounts: toArray(investmentAmount),
            _incomingAssets: toArray(childVaultProxyAddress),
            _minIncomingAssetAmounts: toArray(args.minSharesQuantity)
        });

        assertGe(
            IERC20(childVaultProxyAddress).balanceOf(parentVaultProxyAddress),
            args.minSharesQuantity,
            "Incoming shares balance are zero"
        );
        assertEq(
            IERC20(childVaultDenominationAsset).balanceOf(parentVaultProxyAddress),
            preInvestmentBalance - investmentAmount,
            "Incorrect denomination asset balance"
        );
    }

    function test_buyShares_failsInvalidVaultProxy() public {
        vm.expectRevert(IEnzymeV4VaultAdapter.EnzymeV4VaultAdapter__InvalidVaultProxy.selector);

        __buyShares(
            IEnzymeV4VaultAdapterProd.BuySharesActionArgs({
                vaultProxy: makeAddr("invalidVaultProxy"), investmentAmount: 1, minSharesQuantity: 1
            })
        );
    }

    function test_redeemSharesForSpecificAssets_success() public {
        // buy some shares for parent vault, so it has some shares to redeem
        buyShares({
            _comptrollerProxy: IComptrollerLib(childVaultComptrollerProxyAddress),
            _sharesBuyer: parentVaultProxyAddress,
            _amountToDeposit: assetUnit(IERC20(childVaultDenominationAsset))
        });

        uint256 preSharesBalance = IERC20(childVaultProxyAddress).balanceOf(parentVaultProxyAddress);

        IEnzymeV4VaultAdapterProd.RedeemSharesForSpecificAssetsActionArgs memory args =
            IEnzymeV4VaultAdapterProd.RedeemSharesForSpecificAssetsActionArgs({
                vaultProxy: childVaultProxyAddress,
                sharesQuantity: preSharesBalance,
                payoutAssets: toArray(childVaultDenominationAsset),
                payoutAssetPercentages: toArray(10_000), // 100% in bps
                minPayoutAssetAmounts: toArray(1)
            });

        uint256 preRedemptionChildVaultDenominationAssetBalance =
            IERC20(childVaultDenominationAsset).balanceOf(parentVaultProxyAddress);

        vm.recordLogs();

        __redeemSharesForSpecificAssets(args);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(childVaultProxyAddress),
            _maxSpendAssetAmounts: toArray(preSharesBalance),
            _incomingAssets: toArray(childVaultDenominationAsset),
            _minIncomingAssetAmounts: args.minPayoutAssetAmounts
        });

        assertGe(
            IERC20(childVaultDenominationAsset).balanceOf(parentVaultProxyAddress)
                - preRedemptionChildVaultDenominationAssetBalance,
            args.minPayoutAssetAmounts[0],
            "Payout asset balance is zero"
        );
        assertEq(
            IERC20(childVaultProxyAddress).balanceOf(parentVaultProxyAddress),
            preSharesBalance - args.sharesQuantity,
            "Incorrect shares balance"
        );
    }

    function test_redeemSharesForSpecificAssets_failsInvalidVaultProxy() public {
        vm.expectRevert(IEnzymeV4VaultAdapter.EnzymeV4VaultAdapter__InvalidVaultProxy.selector);

        __redeemSharesForSpecificAssets(
            IEnzymeV4VaultAdapterProd.RedeemSharesForSpecificAssetsActionArgs({
                vaultProxy: makeAddr("invalidVaultProxy"),
                sharesQuantity: 1,
                payoutAssets: toArray(makeAddr("payoutAsset")),
                payoutAssetPercentages: toArray(1),
                minPayoutAssetAmounts: toArray(1)
            })
        );
    }

    function test_action_failsInvalidAction() public {
        vm.expectRevert(IEnzymeV4VaultAdapter.EnzymeV4VaultAdapter__InvalidAction.selector);

        vm.prank(parentVaultFundOwner);
        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: IComptrollerLib(parentVaultComptrollerProxyAddress),
            _adapter: address(adapter),
            _selector: IComptrollerLib.buyShares.selector, // invalid selector
            _actionArgs: abi.encode("")
        });
    }
}

contract EnzymeV4VaultAdapterStandaloneTest is EnzymeV4VaultAdapterTesBase {
    function setUp() public override {
        setUpStandaloneEnvironment();

        __initialize();
    }
}

contract EnzymeV4VaultAdapterEthereumTest is EnzymeV4VaultAdapterTesBase {
    function setUp() public override {
        setUpLiveMainnetEnvironment();

        __initialize();
    }
}

contract EnzymeV4VaultAdapterPolygonTest is EnzymeV4VaultAdapterTesBase {
    function setUp() public override {
        setUpLivePolygonEnvironment();

        __initialize();
    }
}

contract EnzymeV4VaultAdapterArbitrumTest is EnzymeV4VaultAdapterTesBase {
    function setUp() public override {
        setUpLiveArbitrumEnvironment();

        __initialize();
    }
}

contract EnzymeV4VaultAdapterBaseChainTest is EnzymeV4VaultAdapterTesBase {
    function setUp() public override {
        setUpLiveBaseChainEnvironment();

        __initialize();
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IEnzymeVaultAdapter as IEnzymeVaultAdapterProd} from
    "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IEnzymeVaultAdapter.sol";
import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IEnzymeVaultAdapter} from "tests/interfaces/internal/IEnzymeVaultAdapter.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract EnzymeVaultAdapterTesBase is IntegrationTest {
    address internal masterVaultComptrollerProxyAddress;
    address internal masterVaultFundOwner;
    address internal masterVaultProxyAddress;

    address internal strategyVaultComptrollerProxyAddress;
    address internal strategyVaultDenominationAsset;
    address internal strategyVaultFundOwner;
    address internal strategyVaultProxyAddress;

    IEnzymeVaultAdapter internal adapter;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version) internal {
        version = _version;

        (masterVaultComptrollerProxyAddress, masterVaultProxyAddress, masterVaultFundOwner) =
            createTradingFundForVersion(version);

        (strategyVaultComptrollerProxyAddress, strategyVaultProxyAddress, strategyVaultFundOwner) =
            createTradingFundForVersion(version);
        strategyVaultDenominationAsset = IComptrollerLib(strategyVaultComptrollerProxyAddress).getDenominationAsset();

        adapter = __deployAdapter();
    }

    //==================================================================================================================
    // Deployment helpers
    //==================================================================================================================

    function __deployAdapter() private returns (IEnzymeVaultAdapter adapter_) {
        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(version),
            getFundDeployerAddressForVersion(version),
            core.persistent.dispatcher
        );
        return IEnzymeVaultAdapter(deployCode("EnzymeVaultAdapter.sol", args));
    }

    //==================================================================================================================
    // Action helpers
    //==================================================================================================================

    function __action(IEnzymeVaultAdapterProd.Action _actionId, bytes memory _encodedActionArgs) internal {
        bytes memory actionArgs = abi.encode(_actionId, _encodedActionArgs);

        vm.prank(masterVaultFundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: masterVaultComptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: IEnzymeVaultAdapter.action.selector,
            _actionArgs: actionArgs
        });
    }

    function __buyShares(IEnzymeVaultAdapterProd.BuySharesActionArgs memory _args) internal {
        __action(IEnzymeVaultAdapterProd.Action.BuyShares, abi.encode(_args));
    }

    function __redeemShares(IEnzymeVaultAdapterProd.RedeemSharesActionArgs memory _args) internal {
        __action(IEnzymeVaultAdapterProd.Action.RedeemShares, abi.encode(_args));
    }

    //==================================================================================================================
    // Tests
    //==================================================================================================================

    function test_buyShares_success() public {
        // register strategyVaultProxyAddress so it can be received as an incoming asset
        addPrimitiveWithTestAggregator({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: strategyVaultProxyAddress,
            _skipIfRegistered: false
        });

        uint256 investmentAmount = assetUnit(IERC20(strategyVaultDenominationAsset));

        IEnzymeVaultAdapterProd.BuySharesActionArgs memory args = IEnzymeVaultAdapterProd.BuySharesActionArgs({
            vaultProxy: strategyVaultProxyAddress,
            denominationAsset: strategyVaultDenominationAsset,
            investmentAmount: investmentAmount,
            minSharesQuantity: 1
        });

        increaseTokenBalance({
            _token: IERC20(strategyVaultDenominationAsset),
            _to: masterVaultProxyAddress,
            _amount: investmentAmount
        });

        uint256 preInvestmentBalance = IERC20(strategyVaultDenominationAsset).balanceOf(masterVaultProxyAddress);

        vm.recordLogs();

        __buyShares(args);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(strategyVaultDenominationAsset),
            _maxSpendAssetAmounts: toArray(investmentAmount),
            _incomingAssets: toArray(strategyVaultProxyAddress),
            _minIncomingAssetAmounts: toArray(args.minSharesQuantity)
        });

        assertGe(
            IERC20(strategyVaultProxyAddress).balanceOf(masterVaultProxyAddress),
            args.minSharesQuantity,
            "Incoming shares balance are zero"
        );
        assertEq(
            IERC20(strategyVaultDenominationAsset).balanceOf(masterVaultProxyAddress),
            preInvestmentBalance - investmentAmount,
            "Incorrect denomination asset balance"
        );
    }

    function test_buyShares_failsInvalidVaultProxy() public {
        vm.expectRevert(IEnzymeVaultAdapter.EnzymeVaultAdapter__InvalidVaultProxy.selector);

        __buyShares(
            IEnzymeVaultAdapterProd.BuySharesActionArgs({
                vaultProxy: makeAddr("invalidVaultProxy"),
                denominationAsset: makeAddr("denominationAsset"),
                investmentAmount: 1,
                minSharesQuantity: 1
            })
        );
    }

    function test_redeemShares_success() public {
        // buy some shares for master vault, so it has some shares to redeem
        buySharesForVersion({
            _version: version,
            _comptrollerProxyAddress: strategyVaultComptrollerProxyAddress,
            _sharesBuyer: masterVaultProxyAddress,
            _amountToDeposit: assetUnit(IERC20(strategyVaultDenominationAsset))
        });

        uint256 preSharesBalance = IERC20(strategyVaultProxyAddress).balanceOf(masterVaultProxyAddress);

        IEnzymeVaultAdapterProd.RedeemSharesActionArgs memory args = IEnzymeVaultAdapterProd.RedeemSharesActionArgs({
            vaultProxy: strategyVaultProxyAddress,
            sharesQuantity: preSharesBalance,
            payoutAsset: strategyVaultDenominationAsset,
            minPayoutAssetAmount: 1
        });

        uint256 preRedemptionStrategyVaultDenominationAssetBalance =
            IERC20(strategyVaultDenominationAsset).balanceOf(masterVaultProxyAddress);

        vm.recordLogs();

        __redeemShares(args);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(strategyVaultProxyAddress),
            _maxSpendAssetAmounts: toArray(preSharesBalance),
            _incomingAssets: toArray(strategyVaultDenominationAsset),
            _minIncomingAssetAmounts: toArray(args.minPayoutAssetAmount)
        });

        assertGe(
            IERC20(strategyVaultDenominationAsset).balanceOf(masterVaultProxyAddress)
                - preRedemptionStrategyVaultDenominationAssetBalance,
            args.minPayoutAssetAmount,
            "Payout asset balance is zero"
        );
        assertEq(
            IERC20(strategyVaultProxyAddress).balanceOf(masterVaultProxyAddress),
            preSharesBalance - args.sharesQuantity,
            "Incorrect shares balance"
        );
    }

    function test_redeemShares_failsInvalidVaultProxy() public {
        vm.expectRevert(IEnzymeVaultAdapter.EnzymeVaultAdapter__InvalidVaultProxy.selector);

        __redeemShares(
            IEnzymeVaultAdapterProd.RedeemSharesActionArgs({
                vaultProxy: makeAddr("invalidVaultProxy"),
                sharesQuantity: 1,
                payoutAsset: makeAddr("payoutAsset"),
                minPayoutAssetAmount: 1
            })
        );
    }

    function test_action_failsInvalidAction() public {
        vm.expectRevert(IEnzymeVaultAdapter.EnzymeVaultAdapter__InvalidAction.selector);

        vm.prank(masterVaultFundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: masterVaultComptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: IComptrollerLib.buyShares.selector, // invalid selector
            _actionArgs: abi.encode("")
        });
    }
}

contract EnzymeVaultAdapterStandaloneTest is EnzymeVaultAdapterTesBase {
    function setUp() public override {
        setUpStandaloneEnvironment();

        __initialize(EnzymeVersion.Current);
    }
}

contract EnzymeVaultAdapterEthereumV4Test is EnzymeVaultAdapterTesBase {
    function setUp() public override {
        setUpLiveMainnetEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

contract EnzymeVaultAdapterPolygonV4Test is EnzymeVaultAdapterTesBase {
    function setUp() public override {
        setUpLivePolygonEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

contract EnzymeVaultAdapterArbitrumV4Test is EnzymeVaultAdapterTesBase {
    function setUp() public override {
        setUpLiveArbitrumEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

contract EnzymeVaultAdapterBaseChainV4Test is EnzymeVaultAdapterTesBase {
    function setUp() public override {
        setUpLiveBaseChainEnvironment();

        __initialize(EnzymeVersion.V4);
    }
}

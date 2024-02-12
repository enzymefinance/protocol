// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IFeeManager as IFeeManagerProd} from "contracts/release/extensions/fee-manager/IFeeManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFee} from "tests/interfaces/internal/IFee.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {Actions as FeeManagerActions} from "tests/utils/core/FeeUtils.sol";
import {MockDefaultFee} from "tests/utils/Mocks.sol";

// TODO:
// - ideally, we test correct behavior during creation AND (later) post-creation
// - any need to test during migration?
// - does NOT test usesGav or _gavOrZero handling, since these might be augmented by transient storage
// - test case: "__invokeHook: Fund is not active"
// - !! after allowing setting fees at any time: __setValidatedVaultProxy() should only be called on the first run (or not used at all)

contract FeeManagerTest is IntegrationTest {
    // FeeManager events
    event FeeEnabledForFund(address indexed comptrollerProxy, address indexed fee, bytes settingsData);
    event FeeSettledForFund(
        address indexed comptrollerProxy,
        address indexed fee,
        IFeeManagerProd.SettlementType indexed settlementType,
        address payer,
        address payee,
        uint256 sharesDue
    );

    IERC20 denominationAsset;

    function setUp() public override {
        setUpStandaloneEnvironment();

        // Specify an arbitrary denomination asset to use throughout
        denominationAsset = wethToken;
    }

    // HELPERS

    function __createFundWithFees(address[] memory _feeAddresses, bytes[] memory _feeSettings)
        internal
        returns (IComptrollerLib comptrollerProxy_, IVaultLib vaultProxy_, address fundOwner_)
    {
        IFundDeployer.ConfigInput memory comptrollerConfig;
        comptrollerConfig.denominationAsset = address(denominationAsset);
        comptrollerConfig.feeManagerConfigData = abi.encode(_feeAddresses, _feeSettings);

        (comptrollerProxy_, vaultProxy_, fundOwner_) =
            createFund({_fundDeployer: core.release.fundDeployer, _comptrollerConfig: comptrollerConfig});
    }

    function __mockFeeConfigForHook(address _feeAddress, IFeeManagerProd.FeeHook _hook, bool _settles, bool _updates)
        internal
    {
        bool usesGav = false;

        vm.mockCall({
            callee: _feeAddress,
            data: abi.encodeWithSelector(IFee.settlesOnHook.selector, _hook),
            returnData: abi.encode(_settles, usesGav)
        });
        vm.mockCall({
            callee: _feeAddress,
            data: abi.encodeWithSelector(IFee.updatesOnHook.selector, _hook),
            returnData: abi.encode(_updates, usesGav)
        });
    }

    //////////////////////////////
    // TESTS: ORDERED LIFECYCLE //
    //////////////////////////////

    // 1. setConfigForFund()

    function test_setConfigForFund_failsWithDuplicateFee() public {
        address feeAddress = address(new MockDefaultFee());
        address[] memory feeAddresses = toArray(feeAddress, feeAddress);

        vm.expectRevert("setConfigForFund: fees cannot include duplicates");

        __createFundWithFees({_feeAddresses: feeAddresses, _feeSettings: new bytes[](feeAddresses.length)});
    }

    function test_setConfigForFund_failsWithUnequalArrays() public {
        address[] memory feeAddresses = toArray(address(new MockDefaultFee()));

        vm.expectRevert("setConfigForFund: fees and settingsData array lengths unequal");

        __createFundWithFees({_feeAddresses: feeAddresses, _feeSettings: new bytes[](feeAddresses.length + 1)});
    }

    // TODO: will iterate to test migration
    function test_setConfigForFund_success() public {
        address[] memory feeAddresses = toArray(address(new MockDefaultFee()), address(new MockDefaultFee()));
        bytes[] memory feeSettings = toArray("", abi.encode(123));

        address comptrollerProxyAddress = predictComptrollerProxyAddress(core.release.fundDeployer);

        for (uint256 i; i < feeAddresses.length; i++) {
            // Assert each IFee.addFundSettings() called with the expected params
            vm.expectCall({
                callee: feeAddresses[i],
                data: abi.encodeWithSelector(IFee.addFundSettings.selector, comptrollerProxyAddress, feeSettings[i]),
                count: 1
            });

            // Assert expected event per fee
            expectEmit(address(core.release.feeManager));
            emit FeeEnabledForFund(comptrollerProxyAddress, feeAddresses[i], feeSettings[i]);
        }

        // Create fund, enabling fees
        __createFundWithFees({_feeAddresses: feeAddresses, _feeSettings: feeSettings});

        // Assert enabled fees for fund
        address[] memory enabledFees = core.release.feeManager.getEnabledFeesForFund(comptrollerProxyAddress);
        assertEq(enabledFees, feeAddresses, "Incorrect enabledFees");
    }

    // 2. activateForFund()

    // TODO: will iterate to test migration
    function test_activateForFund_success() public {
        address feeAddress1 = address(new MockDefaultFee());
        address feeAddress2 = address(new MockDefaultFee());
        address[] memory feeAddresses = toArray(feeAddress1, feeAddress2);
        bytes[] memory feeSettings = new bytes[](feeAddresses.length);

        address comptrollerProxyAddress = predictComptrollerProxyAddress(core.release.fundDeployer);
        address vaultProxyAddress = predictVaultProxyAddress(core.persistent.dispatcher);

        // Assert each IFee.activateForFund() called with the expected params
        for (uint256 i; i < feeAddresses.length; i++) {
            vm.expectCall({
                callee: feeAddresses[i],
                data: abi.encodeWithSelector(IFee.activateForFund.selector, comptrollerProxyAddress, vaultProxyAddress),
                count: 1
            });
        }

        // Create fund, enabling and then activating fees
        __createFundWithFees({_feeAddresses: feeAddresses, _feeSettings: feeSettings});
    }

    ///////////////////////////
    // TESTS: ACTION ROUTING //
    ///////////////////////////

    function test_receiveCallFromComptroller_failsWithInvalidActionId() public {
        // No fees needed for this test
        (IComptrollerLib comptrollerProxy,,) =
            __createFundWithFees({_feeAddresses: new address[](0), _feeSettings: new bytes[](0)});

        uint256 invalidActionId = uint256(type(FeeManagerActions).max) + 1;

        vm.expectRevert("receiveCallFromComptroller: Invalid _actionId");
        comptrollerProxy.callOnExtension({
            _extension: address(core.release.feeManager),
            _actionId: invalidActionId,
            _callArgs: ""
        });
    }

    function test_receiveCallFromComptroller_successWithInvokeContinuousFeeHook() public {
        // Create fee that runs on FeeHook.Continuous
        address feeAddress = address(new MockDefaultFee());
        IFeeManagerProd.FeeHook hook = IFeeManagerProd.FeeHook.Continuous;
        __mockFeeConfigForHook({_feeAddress: feeAddress, _hook: hook, _settles: true, _updates: false});

        (IComptrollerLib comptrollerProxy,,) =
            __createFundWithFees({_feeAddresses: toArray(feeAddress), _feeSettings: new bytes[](1)});

        // Assert that the fee.settle() is called (don't validate the args)
        vm.expectCall({callee: feeAddress, data: abi.encodeWithSelector(IFee.settle.selector), count: 1});

        comptrollerProxy.callOnExtension({
            _extension: address(core.release.feeManager),
            _actionId: uint256(FeeManagerActions.InvokeContinuousFeeHook),
            _callArgs: ""
        });
    }

    ////////////////////////
    // TESTS: INVOKE FEES //
    ////////////////////////

    function test_invokeHook_successWithNoEnabledFees() public {
        // Create fund without any fees
        (IComptrollerLib comptrollerProxy,,) =
            __createFundWithFees({_feeAddresses: new address[](0), _feeSettings: new bytes[](0)});

        // Invoke any hook (from the ComptrollerProxy); should not fail
        vm.prank(address(comptrollerProxy));
        core.release.feeManager.invokeHook({
            _hook: formatFeeHook(IFeeManagerProd.FeeHook.PreBuyShares),
            _settlementData: abi.encode(123),
            _gav: 456
        });
    }

    // Tests correct calling of IFee.settle() and IFee.update() based on IFee.settlesOnHook() and IFee.updatesOnHook()
    function test_invokeHook_callsSettleAndUpdateForAllFeesOnHook() public {
        IFeeManagerProd.FeeHook targetHook = IFeeManagerProd.FeeHook.PreBuyShares;
        IFeeManagerProd.FeeHook decoyHook = IFeeManagerProd.FeeHook.Continuous;

        // Create fees that alternatingly settle and update on a target hook
        address settleOnlyFeeAddress = address(new MockDefaultFee());
        address updateOnlyFeeAddress = address(new MockDefaultFee());
        address settleAndUpdateFeeAddress = address(new MockDefaultFee());
        __mockFeeConfigForHook({_feeAddress: settleOnlyFeeAddress, _hook: targetHook, _settles: true, _updates: false});
        __mockFeeConfigForHook({_feeAddress: updateOnlyFeeAddress, _hook: targetHook, _settles: false, _updates: true});
        __mockFeeConfigForHook({
            _feeAddress: settleAndUpdateFeeAddress,
            _hook: targetHook,
            _settles: true,
            _updates: true
        });

        // Create a decoy fee that settles and updates, but not on the target hook
        address decoyFeeAddress = address(new MockDefaultFee());
        __mockFeeConfigForHook({_feeAddress: decoyFeeAddress, _hook: decoyHook, _settles: true, _updates: true});

        // Insert decoy fee in the middle of fees array
        address[] memory feeAddresses =
            toArray(settleOnlyFeeAddress, updateOnlyFeeAddress, decoyFeeAddress, settleAndUpdateFeeAddress);

        // Create fund, enabling and then activating fees
        (IComptrollerLib comptrollerProxy, IVaultLib vaultProxy,) =
            __createFundWithFees({_feeAddresses: feeAddresses, _feeSettings: new bytes[](feeAddresses.length)});

        // Define arbitrary settlement data
        bytes memory settlementData = abi.encode(123);
        uint256 gav = 456;

        {
            // Assert IFee.settle() called correctly
            bytes memory settleData = abi.encodeWithSelector(
                IFee.settle.selector, comptrollerProxy, vaultProxy, targetHook, settlementData, gav
            );
            vm.expectCall({callee: settleOnlyFeeAddress, data: settleData, count: 1});
            vm.expectCall({callee: settleAndUpdateFeeAddress, data: settleData, count: 1});

            // Assert IFee.settle() not called
            vm.expectCall({callee: updateOnlyFeeAddress, data: abi.encodeWithSelector(IFee.settle.selector), count: 0});
            vm.expectCall({callee: decoyFeeAddress, data: abi.encodeWithSelector(IFee.settle.selector), count: 0});
        }

        {
            // Assert IFee.update() called correctly
            bytes memory updateData = abi.encodeWithSelector(
                IFee.update.selector, comptrollerProxy, vaultProxy, targetHook, settlementData, gav
            );
            vm.expectCall({callee: updateOnlyFeeAddress, data: updateData, count: 1});
            vm.expectCall({callee: settleAndUpdateFeeAddress, data: updateData, count: 1});

            // Assert IFee.update() not called
            vm.expectCall({callee: settleOnlyFeeAddress, data: abi.encodeWithSelector(IFee.update.selector), count: 0});
            vm.expectCall({callee: decoyFeeAddress, data: abi.encodeWithSelector(IFee.update.selector), count: 0});
        }

        // Invoke the target hook (from the ComptrollerProxy)
        vm.prank(address(comptrollerProxy));
        core.release.feeManager.invokeHook({
            _hook: formatFeeHook(targetHook),
            _settlementData: settlementData,
            _gav: gav
        });
    }

    //////////////////////////////////////////
    // TESTS: INVOKE FEES: SETTLEMENT TYPES //
    //////////////////////////////////////////

    function test_invokeHook_settlementType_burn() public {
        __test_invokeHook_settlementType({
            _settlementType: IFeeManagerProd.SettlementType.Burn,
            _specifyRecipient: false
        });
    }

    function test_invokeHook_settlementType_directWithDefaultRecipient() public {
        __test_invokeHook_settlementType({
            _settlementType: IFeeManagerProd.SettlementType.Direct,
            _specifyRecipient: false
        });
    }

    function test_invokeHook_settlementType_directWithSpecifiedRecipient() public {
        __test_invokeHook_settlementType({
            _settlementType: IFeeManagerProd.SettlementType.Direct,
            _specifyRecipient: true
        });
    }

    function test_invokeHook_settlementType_mintWithDefaultRecipient() public {
        __test_invokeHook_settlementType({
            _settlementType: IFeeManagerProd.SettlementType.Mint,
            _specifyRecipient: false
        });
    }

    function test_invokeHook_settlementType_mintWithSpecifiedRecipient() public {
        __test_invokeHook_settlementType({_settlementType: IFeeManagerProd.SettlementType.Mint, _specifyRecipient: true});
    }

    function __test_invokeHook_settlementType(IFeeManagerProd.SettlementType _settlementType, bool _specifyRecipient)
        internal
    {
        // Arbitrary settlement data
        address payer = makeAddr("Payer");
        uint256 sharesDue = 123;
        // Use Continuous hook, to easily run fee without other system logic
        IFeeManagerProd.FeeHook targetHook = IFeeManagerProd.FeeHook.Continuous;

        // Create fee that settles on a target hook, with the defined settlement return data
        address feeAddress = address(new MockDefaultFee());
        __mockFeeConfigForHook({_feeAddress: feeAddress, _hook: targetHook, _settles: true, _updates: false});
        vm.mockCall({
            callee: feeAddress,
            data: abi.encodeWithSelector(IFee.settle.selector),
            returnData: abi.encode(_settlementType, payer, sharesDue)
        });

        // Create fund, enabling and then activating fees
        (IComptrollerLib comptrollerProxy, IVaultLib vaultProxy, address fundOwner) =
            __createFundWithFees({_feeAddresses: toArray(feeAddress), _feeSettings: new bytes[](1)});

        // Conditionally specify a recipient for the fee
        address feeRecipient;
        // Payee is ignored for Burn
        if (_settlementType != IFeeManagerProd.SettlementType.Burn) {
            if (_specifyRecipient) {
                // Update the fee's recipient to a misc address
                feeRecipient = makeAddr("FeeRecipient");
                vm.mockCall({
                    callee: feeAddress,
                    data: abi.encodeWithSelector(IFee.getRecipientForFund.selector),
                    returnData: abi.encode(feeRecipient)
                });
            } else {
                feeRecipient = fundOwner;
            }
        }

        // Buy some shares for the payer
        uint256 initialPayerShares = sharesDue * 5;
        buyShares({_sharesBuyer: payer, _comptrollerProxy: comptrollerProxy, _amountToDeposit: initialPayerShares});
        uint256 initialSharesSupply = vaultProxy.totalSupply();

        // Assert the event is emitted correctly
        expectEmit(address(core.release.feeManager));
        emit FeeSettledForFund(address(comptrollerProxy), feeAddress, _settlementType, payer, feeRecipient, sharesDue);

        // Invoke Continuous fees
        invokeContinuousFeeHook({_feeManager: core.release.feeManager, _comptrollerProxy: comptrollerProxy});

        // Assert shares balances were updated correctly for the SettlementType
        if (_settlementType == IFeeManagerProd.SettlementType.Burn) {
            assertEq(vaultProxy.totalSupply(), initialSharesSupply - sharesDue, "Burn: Incorrect totalSupply");
            assertEq(vaultProxy.balanceOf(payer), initialPayerShares - sharesDue, "Burn: Incorrect payer balance");
        } else if (_settlementType == IFeeManagerProd.SettlementType.Mint) {
            assertEq(vaultProxy.totalSupply(), initialSharesSupply + sharesDue, "Mint: Incorrect totalSupply");
            assertEq(vaultProxy.balanceOf(feeRecipient), sharesDue, "Mint: Incorrect payee balance");
        } else if (_settlementType == IFeeManagerProd.SettlementType.Direct) {
            assertEq(vaultProxy.totalSupply(), initialSharesSupply, "Direct: Incorrect totalSupply");
            assertEq(vaultProxy.balanceOf(payer), initialPayerShares - sharesDue, "Direct: Incorrect payer balance");
            assertEq(vaultProxy.balanceOf(feeRecipient), sharesDue, "Direct: Incorrect payee balance");
        }
    }
}

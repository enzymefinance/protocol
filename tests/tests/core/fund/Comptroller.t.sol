// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IVault as IVaultProd} from "contracts/release/core/fund/vault/IVault.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IExtension} from "tests/interfaces/internal/IExtension.sol";
import {IVaultCore} from "tests/interfaces/internal/IVaultCore.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {CoreUtils} from "tests/utils/CoreUtils.sol";
import {
    MockDefaultExtension,
    MockDefaultFee,
    MockDefaultMigrationHookHandler,
    MockDefaultPolicy
} from "tests/utils/Mocks.sol";

contract ComptrollerTest is IntegrationTest {
    // ComptrollerLib events
    event ExtensionEnabled(address indexed extension, bytes configData);
    event Initialized(address vaultProxy, IComptrollerLib.ConfigInput config);

    function setUp() public override {
        setUpStandaloneEnvironment();
    }

    //////////////////////
    // TESTS: LIFECYCLE //
    //////////////////////

    struct LifecycleTestVars {
        IComptrollerLib.ConfigInput comptrollerConfig;
    }

    function __test_lifecycle_setup() private returns (LifecycleTestVars memory testVars_) {
        // Create a "full" Comptroller config, that uses all components

        // Create mock fee
        bytes memory feeManagerConfigData = encodeFeeManagerConfigData({
            _fees: toArray(address(new MockDefaultFee())),
            _settingsData: toArray(bytes(""))
        });

        // Create mock policy
        bytes memory policyManagerConfigData = encodePolicyManagerConfigData({
            _policies: toArray(address(new MockDefaultPolicy())),
            _settingsData: toArray(bytes("0x123"))
        });

        // Create mock extensions
        IComptrollerLib.ExtensionConfigInput[] memory extensionsConfig = new IComptrollerLib.ExtensionConfigInput[](2);
        extensionsConfig[0] =
            IComptrollerLib.ExtensionConfigInput({extension: address(new MockDefaultExtension()), configData: ""});
        extensionsConfig[1] = IComptrollerLib.ExtensionConfigInput({
            extension: address(new MockDefaultExtension()),
            configData: bytes("test")
        });

        // Create Comptroller config
        IComptrollerLib.ConfigInput memory comptrollerConfig;
        comptrollerConfig.denominationAsset = address(wrappedNativeToken);
        comptrollerConfig.sharesActionTimelock = 123;
        comptrollerConfig.feeManagerConfigData = feeManagerConfigData;
        comptrollerConfig.policyManagerConfigData = policyManagerConfigData;
        comptrollerConfig.extensionsConfig = extensionsConfig;

        return LifecycleTestVars({comptrollerConfig: comptrollerConfig});
    }

    function test_init_failsWithAlreadyInitialized() public {
        LifecycleTestVars memory testVars = __test_lifecycle_setup();

        (IComptrollerLib comptrollerProxy,,) = createFund({
            _fundDeployer: core.release.fundDeployer,
            _comptrollerConfig: formatComptrollerConfigInputForFundDeployer(testVars.comptrollerConfig)
        });

        // Attempting to re-call init() post-creation should fail
        address newVaultProxyAddress = makeAddr("NewVaultProxy");
        IComptrollerLib.ConfigInput memory newConfig;
        vm.expectRevert("init: Already initialized");
        comptrollerProxy.init({_vaultProxy: newVaultProxyAddress, _config: newConfig});
    }

    // TODO: implement, if we keep denomination asset
    // function test_init_failsWithUnsupportedDenominationAsset() public {}

    function __test_init_assertMockCallsAndEvents(
        LifecycleTestVars memory _testVars,
        address _comptrollerProxyAddress,
        address _vaultProxyAddress
    ) private {
        // Assert call: FeeManager
        vm.expectCall({
            callee: address(core.release.feeManager),
            data: abi.encodeWithSelector(
                IExtension.setConfigForFund.selector, _testVars.comptrollerConfig.feeManagerConfigData
                ),
            count: 1
        });

        // Assert call: PolicyManager
        vm.expectCall({
            callee: address(core.release.policyManager),
            data: abi.encodeWithSelector(
                IExtension.setConfigForFund.selector, _testVars.comptrollerConfig.policyManagerConfigData
                ),
            count: 1
        });

        // Assert calls and events: extensions
        for (uint256 i; i < _testVars.comptrollerConfig.extensionsConfig.length; i++) {
            address extensionAddress = _testVars.comptrollerConfig.extensionsConfig[i].extension;
            bytes memory configData = _testVars.comptrollerConfig.extensionsConfig[i].configData;

            vm.expectCall({
                callee: extensionAddress,
                data: abi.encodeWithSelector(IExtension.setConfigForFund.selector, configData),
                count: 1
            });

            expectEmit(address(_comptrollerProxyAddress));
            emit ExtensionEnabled(extensionAddress, configData);
        }

        // Assert event
        expectEmit(address(_comptrollerProxyAddress));
        emit Initialized(_vaultProxyAddress, _testVars.comptrollerConfig);
    }

    function __test_init_assertStorage(
        LifecycleTestVars memory _testVars,
        IComptrollerLib _comptrollerProxy,
        address _vaultProxyAddress
    ) private {
        assertEq(_comptrollerProxy.getVaultProxy(), _vaultProxyAddress);
        assertEq(_comptrollerProxy.getDenominationAsset(), _testVars.comptrollerConfig.denominationAsset);
        assertEq(_comptrollerProxy.getSharesActionTimelock(), _testVars.comptrollerConfig.sharesActionTimelock);
        {
            address[] memory enabledExtensions = _comptrollerProxy.getExtensions();
            assertEq(
                enabledExtensions.length,
                _testVars.comptrollerConfig.extensionsConfig.length,
                "bad enabledExtensions count"
            );
            for (uint256 i; i < _testVars.comptrollerConfig.extensionsConfig.length; i++) {
                address extensionAddress = _testVars.comptrollerConfig.extensionsConfig[i].extension;

                assertEq(enabledExtensions[i], extensionAddress, "extension not in enabledExtensions");
                assertTrue(_comptrollerProxy.isExtension(extensionAddress), "extension not isExtension");
            }
        }
    }

    function test_init_successWithMigratedFund() public {
        LifecycleTestVars memory testVars = __test_lifecycle_setup();

        // Create a VaultProxy instance on prev release
        address vaultProxyAddress = createVaultFromMockFundDeployer({
            _dispatcher: core.persistent.dispatcher,
            _vaultLibAddress: core.release.fundDeployer.getVaultLib()
        });
        address fundOwner = IVaultCore(vaultProxyAddress).getOwner();

        // Deterministic new ComptrollerProxy
        IComptrollerLib comptrollerProxy = IComptrollerLib(predictComptrollerProxyAddress(core.release.fundDeployer));

        __test_init_assertMockCallsAndEvents({
            _testVars: testVars,
            _comptrollerProxyAddress: address(comptrollerProxy),
            _vaultProxyAddress: vaultProxyAddress
        });

        // Create the migration request
        vm.prank(fundOwner);
        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: vaultProxyAddress,
            _comptrollerConfig: formatComptrollerConfigInputForFundDeployer(testVars.comptrollerConfig),
            _bypassPrevReleaseFailure: false
        });

        __test_init_assertStorage({
            _testVars: testVars,
            _comptrollerProxy: comptrollerProxy,
            _vaultProxyAddress: vaultProxyAddress
        });
    }

    function __test_activate_assertMockCalls(LifecycleTestVars memory _testVars) private {
        // Assert call: FeeManager
        vm.expectCall({
            callee: address(core.release.feeManager),
            data: abi.encodeWithSelector(IExtension.activateForFund.selector),
            count: 1
        });

        // Assert call: PolicyManager
        vm.expectCall({
            callee: address(core.release.policyManager),
            data: abi.encodeWithSelector(IExtension.activateForFund.selector),
            count: 1
        });

        // Assert calls: extensions
        for (uint256 i; i < _testVars.comptrollerConfig.extensionsConfig.length; i++) {
            address extensionAddress = _testVars.comptrollerConfig.extensionsConfig[i].extension;

            vm.expectCall({
                callee: extensionAddress,
                data: abi.encodeWithSelector(IExtension.activateForFund.selector),
                count: 1
            });
        }
    }

    function __test_activate_assertStorage(LifecycleTestVars memory _testVars, address _vaultProxyAddress) private {
        // Assert storage change
        assertTrue(IVaultLib(payable(_vaultProxyAddress)).isTrackedAsset(_testVars.comptrollerConfig.denominationAsset));
    }

    function test_activate_successWithMigratedFund() public {
        LifecycleTestVars memory testVars = __test_lifecycle_setup();

        // Create a VaultProxy instance on prev release
        address vaultProxyAddress = createVaultFromMockFundDeployer({
            _dispatcher: core.persistent.dispatcher,
            _vaultLibAddress: core.release.fundDeployer.getVaultLib()
        });
        address fundOwner = IVaultCore(vaultProxyAddress).getOwner();

        // Create the migration request
        vm.prank(fundOwner);
        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: vaultProxyAddress,
            _comptrollerConfig: formatComptrollerConfigInputForFundDeployer(testVars.comptrollerConfig),
            _bypassPrevReleaseFailure: false
        });

        // Warp beyond migration timelock
        skip(core.persistent.dispatcher.getMigrationTimelock());

        __test_activate_assertMockCalls({_testVars: testVars});

        // Execute the migration
        vm.prank(fundOwner);
        core.release.fundDeployer.executeMigration({_vaultProxy: vaultProxyAddress, _bypassPrevReleaseFailure: false});

        __test_activate_assertStorage({_testVars: testVars, _vaultProxyAddress: vaultProxyAddress});
    }

    // init() and activate() are both called during new fund creation
    function test_initAndActivate_successWithNewFund() public {
        LifecycleTestVars memory testVars = __test_lifecycle_setup();

        // Deterministic fund core addresses
        IComptrollerLib comptrollerProxy = IComptrollerLib(predictComptrollerProxyAddress(core.release.fundDeployer));
        IVaultLib vaultProxy = IVaultLib(payable(predictVaultProxyAddress(core.persistent.dispatcher)));

        __test_init_assertMockCallsAndEvents({
            _testVars: testVars,
            _comptrollerProxyAddress: address(comptrollerProxy),
            _vaultProxyAddress: address(vaultProxy)
        });
        __test_activate_assertMockCalls({_testVars: testVars});

        createFund({
            _fundDeployer: core.release.fundDeployer,
            _comptrollerConfig: formatComptrollerConfigInputForFundDeployer(testVars.comptrollerConfig)
        });

        __test_init_assertStorage({
            _testVars: testVars,
            _comptrollerProxy: comptrollerProxy,
            _vaultProxyAddress: address(vaultProxy)
        });
        __test_activate_assertStorage({_testVars: testVars, _vaultProxyAddress: address(vaultProxy)});
    }

    function test_deactivate_successWhenMigratingOut() public {
        LifecycleTestVars memory testVars = __test_lifecycle_setup();

        // Create fund on this release
        (, IVaultLib vaultProxy,) = createFund({
            _fundDeployer: core.release.fundDeployer,
            _comptrollerConfig: formatComptrollerConfigInputForFundDeployer(testVars.comptrollerConfig)
        });

        // Create a mock fund deployer and set to be the current release
        address newFundDeployerAddress = address(new MockDefaultMigrationHookHandler());
        vm.prank(core.persistent.dispatcher.getOwner());
        core.persistent.dispatcher.setCurrentFundDeployer(newFundDeployerAddress);

        // Signal migration to the new release
        // (uses the previous comptroller and vault libs)
        vm.prank(newFundDeployerAddress);
        core.persistent.dispatcher.signalMigration({
            _vaultProxy: address(vaultProxy),
            _nextVaultAccessor: core.release.comptrollerLibAddress,
            _nextVaultLib: core.release.vaultLibAddress,
            _bypassFailure: false
        });

        // Warp beyond migration timelock
        skip(core.persistent.dispatcher.getMigrationTimelock());

        // Assert call: pay protocol fee
        vm.expectCall({
            callee: address(vaultProxy),
            data: abi.encodeWithSelector(IVaultLib.payProtocolFee.selector),
            count: 1
        });

        // Assert calls: deactivate extensions
        for (uint256 i; i < testVars.comptrollerConfig.extensionsConfig.length; i++) {
            vm.expectCall({
                callee: testVars.comptrollerConfig.extensionsConfig[i].extension,
                data: abi.encodeWithSelector(IExtension.deactivateForFund.selector),
                count: 1
            });
        }

        // Migrate
        vm.prank(newFundDeployerAddress);
        core.persistent.dispatcher.executeMigration({_vaultProxy: address(vaultProxy), _bypassFailure: false});
    }

    ///////////////////////
    // TESTS: EXTENSIONS //
    ///////////////////////

    // PERMISSIONED VAULT ACTION PATHWAY

    // TODO: if we keep `allowsPermissionedVaultAction` check, test modifier behavior

    struct CallOnExtensionTestVars {
        address extensionAddress;
        uint256 actionId;
        bytes callArgs;
    }

    function __test_callOnExtension_setup() private returns (CallOnExtensionTestVars memory testVars_) {
        // Setup a default mock extension and define a call to it

        return CallOnExtensionTestVars({
            extensionAddress: address(new MockDefaultExtension()),
            actionId: 123,
            callArgs: "test"
        });
    }

    function test_callOnExtension_failsWithInvalidExtension() public {
        CallOnExtensionTestVars memory testVars = __test_callOnExtension_setup();

        // Create a fund, but do not enable the extension
        (IComptrollerLib comptrollerProxy,,) =
            createFundMinimal({_fundDeployer: core.release.fundDeployer, _denominationAsset: wrappedNativeToken});

        vm.expectRevert("callOnExtension: _extension invalid");
        comptrollerProxy.callOnExtension({
            _extension: testVars.extensionAddress,
            _actionId: testVars.actionId,
            _callArgs: testVars.callArgs
        });
    }

    function test_callOnExtension_success() public {
        CallOnExtensionTestVars memory testVars = __test_callOnExtension_setup();

        // Create a fund, with extension enabled
        (IComptrollerLib comptrollerProxy,,) = createFundWithExtension({
            _fundDeployer: core.release.fundDeployer,
            _denominationAsset: wrappedNativeToken,
            _extensionAddress: testVars.extensionAddress,
            _extensionConfigData: bytes("")
        });

        // Assert expected call
        address caller = makeAddr("Caller");
        vm.expectCall({
            callee: testVars.extensionAddress,
            data: abi.encodeWithSelector(
                IExtension.receiveCallFromComptroller.selector, caller, testVars.actionId, testVars.callArgs
                ),
            count: 1
        });

        vm.prank(caller);
        comptrollerProxy.callOnExtension({
            _extension: testVars.extensionAddress,
            _actionId: testVars.actionId,
            _callArgs: testVars.callArgs
        });
    }

    struct PermissionedVaultActionTestVars {
        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        MockAddTrackedAssetExtension mockAddTrackedAssetExtension;
        IVaultProd.VaultAction vaultAction;
        bytes actionData;
        address assetAddressToTrack;
    }

    function __test_permissionedVaultAction_setup()
        private
        returns (PermissionedVaultActionTestVars memory testVars_)
    {
        // Setup a fund with a mock extension that, when called via callOnExtension(),
        // will callback to permissionedVaultAction() with an attempt to add a tracked asset

        MockAddTrackedAssetExtension mockAddTrackedAssetExtension = new MockAddTrackedAssetExtension();
        address assetAddressToTrack = mockAddTrackedAssetExtension.assetToTrack();

        (IComptrollerLib comptrollerProxy, IVaultLib vaultProxy,) = createFundWithExtension({
            _fundDeployer: core.release.fundDeployer,
            _denominationAsset: wrappedNativeToken,
            _extensionAddress: address(mockAddTrackedAssetExtension),
            _extensionConfigData: bytes("")
        });

        return PermissionedVaultActionTestVars({
            comptrollerProxy: comptrollerProxy,
            vaultProxy: vaultProxy,
            mockAddTrackedAssetExtension: mockAddTrackedAssetExtension,
            vaultAction: IVaultProd.VaultAction.AddTrackedAsset,
            actionData: abi.encode(assetAddressToTrack),
            assetAddressToTrack: assetAddressToTrack
        });
    }

    function test_permissionedVaultAction_failsWithoutPermissionedVaultActionAllowedFlag() public {
        PermissionedVaultActionTestVars memory testVars = __test_permissionedVaultAction_setup();

        // Calling directly from the extension should fail
        vm.expectRevert("permissionedVaultAction: No actions allowed");
        vm.prank(address(testVars.mockAddTrackedAssetExtension));
        testVars.comptrollerProxy.permissionedVaultAction({
            _action: formatVaultActionForComptroller(testVars.vaultAction),
            _actionData: testVars.actionData
        });
    }

    function test_permissionedVaultAction_success() public {
        PermissionedVaultActionTestVars memory testVars = __test_permissionedVaultAction_setup();

        // Calling via the Comptroller should succeed
        testVars.comptrollerProxy.callOnExtension({
            _extension: address(testVars.mockAddTrackedAssetExtension),
            _actionId: 0,
            _callArgs: ""
        });

        // Test that the VaultAction was executed
        assertTrue(testVars.vaultProxy.isTrackedAsset(testVars.assetAddressToTrack), "asset not tracked");
    }
}

/// @dev IExtension implementation that executes VaultAction.AddTrackedAsset upon any call to receiveCallFromComptroller()
contract MockAddTrackedAssetExtension is MockDefaultExtension, CoreUtils {
    address public assetToTrack = address(1234);

    function receiveCallFromComptroller(address, uint256, bytes calldata) external override {
        IComptrollerLib(msg.sender).permissionedVaultAction({
            _action: formatVaultActionForComptroller(IVaultProd.VaultAction.AddTrackedAsset),
            _actionData: abi.encode(assetToTrack)
        });
    }
}

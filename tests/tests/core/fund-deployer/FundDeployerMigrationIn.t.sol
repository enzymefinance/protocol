// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IVaultCore} from "tests/interfaces/internal/IVaultCore.sol";

contract FundDeployerMigrationInTest is IntegrationTest {
    bool internal bypassPrevReleaseFailure; // Don't bypass failures by default
    address internal migrator;
    address internal vaultOwner;
    IVaultCore internal vaultProxyCore;

    function setUp() public virtual override {
        setUpStandaloneEnvironment();

        // Create VaultProxy attached to another release
        vaultProxyCore = IVaultCore(
            createVaultFromMockFundDeployer({
                _dispatcher: core.persistent.dispatcher,
                _vaultLibAddress: core.release.fundDeployer.getVaultLib()
            })
        );
        vaultOwner = vaultProxyCore.getOwner();

        // Set the `migrator` role on the vault
        migrator = makeAddr("Migrator");
        vm.prank(vaultProxyCore.getOwner());
        IVaultLib(payable(address(vaultProxyCore))).setMigrator(migrator);
    }
}

contract FundDeployerCreateMigrationRequestTest is FundDeployerMigrationInTest {
    event MigrationRequestCreated(address indexed creator, address indexed vaultProxy, address comptrollerProxy);

    // TODO: use newFundDeployer instead of core.release.fundDeployer
    // function test_failsWithNonLiveRelease() public {
    //     vm.expectRevert("Release is not yet live");
    //     vm.prank(vaultOwner);

    //     core.release.fundDeployer.createMigrationRequest({
    //         _vaultProxy: address(vaultProxyCore),
    //         _denominationAsset: address(standardPrimitive),
    //         _sharesActionTimelock: 123,
    //         _feeManagerConfigData: "",
    //         _policyManagerConfigData: "",
    //         _bypassPrevReleaseFailure: bypassPrevReleaseFailure
    //     });
    // }

    function test_failsWithNonMigrator() public {
        address randomSigner = makeAddr("RandomSigner");

        vm.expectRevert("Only a permissioned migrator can call this function");
        vm.prank(randomSigner);

        IFundDeployer.ExtensionConfigInput[] memory extensionsConfig;

        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _comptrollerConfig: IFundDeployer.ConfigInput({
                denominationAsset: address(standardPrimitive),
                sharesActionTimelock: 123,
                feeManagerConfigData: "",
                policyManagerConfigData: "",
                extensionsConfig: extensionsConfig
            }),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_success() public {
        address expectedComptrollerProxy = predictComptrollerProxyAddress(core.release.fundDeployer);

        // Define migration request params
        address migrationRequestCaller = vaultProxyCore.getOwner();
        address denominationAsset = address(standardPrimitive);
        uint256 sharesActionTimelock = 123;

        // Prepare event assertions
        expectEmit(address(core.release.fundDeployer));
        emit MigrationRequestCreated(migrationRequestCaller, address(vaultProxyCore), address(expectedComptrollerProxy));

        // Create migration request
        IFundDeployer.ExtensionConfigInput[] memory extensionsConfig;
        vm.prank(migrationRequestCaller);
        IComptrollerLib comptrollerProxy = IComptrollerLib(
            core.release.fundDeployer.createMigrationRequest({
                _vaultProxy: address(vaultProxyCore),
                _comptrollerConfig: IFundDeployer.ConfigInput({
                    denominationAsset: denominationAsset,
                    sharesActionTimelock: sharesActionTimelock,
                    feeManagerConfigData: "",
                    policyManagerConfigData: "",
                    extensionsConfig: extensionsConfig
                }),
                _bypassPrevReleaseFailure: bypassPrevReleaseFailure
            })
        );

        // Assert the Dispatcher stored the MigrationRequest.
        // `executableTimestamp` is programmatic.
        (address nextFundDeployer, address nextVaultAccessor, address nextVaultLib,) =
            core.persistent.dispatcher.getMigrationRequestDetailsForVaultProxy(address(vaultProxyCore));
        assertEq(nextFundDeployer, address(core.release.fundDeployer));
        assertEq(nextVaultAccessor, address(comptrollerProxy));
        assertEq(nextVaultLib, core.release.fundDeployer.getVaultLib());

        // Assert the correct ComptrollerProxy state values
        assertEq(comptrollerProxy.getVaultProxy(), address(vaultProxyCore));
        assertEq(comptrollerProxy.getDenominationAsset(), denominationAsset);
        assertEq(comptrollerProxy.getSharesActionTimelock(), sharesActionTimelock);

        // Assert the correct FundDeployer state values
        assertEq(
            core.release.fundDeployer.getVaultProxyForComptrollerProxy(address(comptrollerProxy)),
            address(vaultProxyCore)
        );

        // TODO: Assert the extensions were called correctly
    }

    function test_successWithMigratorCaller() public {
        address expectedComptrollerProxy = predictComptrollerProxyAddress(core.release.fundDeployer);

        // Prepare event assertions
        expectEmit(address(core.release.fundDeployer));
        emit MigrationRequestCreated(migrator, address(vaultProxyCore), address(expectedComptrollerProxy));

        // Create migration request
        IFundDeployer.ExtensionConfigInput[] memory extensionsConfig;
        vm.prank(migrator);
        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _comptrollerConfig: IFundDeployer.ConfigInput({
                denominationAsset: address(standardPrimitive),
                sharesActionTimelock: 123,
                feeManagerConfigData: "",
                policyManagerConfigData: "",
                extensionsConfig: extensionsConfig
            }),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }
}

contract FundDeployerCancelMigrationTest is FundDeployerMigrationInTest {
    address internal nextComptrollerProxyAddress;

    function setUp() public virtual override {
        super.setUp();

        // Create migration request
        IFundDeployer.ExtensionConfigInput[] memory extensionsConfig;
        vm.prank(vaultOwner);
        nextComptrollerProxyAddress = core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _comptrollerConfig: IFundDeployer.ConfigInput({
                denominationAsset: address(standardPrimitive),
                sharesActionTimelock: 123,
                feeManagerConfigData: "",
                policyManagerConfigData: "",
                extensionsConfig: extensionsConfig
            }),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_failsWithNonMigrator() public {
        address randomSigner = makeAddr("RandomSigner");

        vm.expectRevert("Only a permissioned migrator can call this function");
        vm.prank(randomSigner);

        core.release.fundDeployer.cancelMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    // Also tests `invokeMigrationInCancelHook()`
    function test_success() public {
        // Assert Dispatcher.cancelMigration() will be called correctly
        vm.expectCall(
            address(core.persistent.dispatcher),
            abi.encodeWithSelector(
                core.persistent.dispatcher.cancelMigration.selector, address(vaultProxyCore), bypassPrevReleaseFailure
            )
        );

        vm.prank(vaultOwner);
        core.release.fundDeployer.cancelMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_successWithFailureBypass() public {
        bypassPrevReleaseFailure = true;

        // Assert Dispatcher.cancelMigration() will be called correctly
        vm.expectCall(
            address(core.persistent.dispatcher),
            abi.encodeWithSelector(
                core.persistent.dispatcher.cancelMigration.selector, address(vaultProxyCore), bypassPrevReleaseFailure
            )
        );
        vm.prank(vaultOwner);

        core.release.fundDeployer.cancelMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_successWithMigratorCaller() public {
        vm.prank(migrator);

        core.release.fundDeployer.cancelMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }
}

contract FundDeployerExecuteMigrationTest is FundDeployerMigrationInTest {
    address internal nextComptrollerProxyAddress;

    function setUp() public virtual override {
        super.setUp();

        // Create migration request
        IFundDeployer.ExtensionConfigInput[] memory extensionsConfig;
        vm.prank(vaultOwner);
        nextComptrollerProxyAddress = core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _comptrollerConfig: IFundDeployer.ConfigInput({
                denominationAsset: address(standardPrimitive),
                sharesActionTimelock: 123,
                feeManagerConfigData: "",
                policyManagerConfigData: "",
                extensionsConfig: extensionsConfig
            }),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });

        // Warp beyond the migration timelock
        (,,, uint256 executionTimestamp) =
            core.persistent.dispatcher.getMigrationRequestDetailsForVaultProxy(address(vaultProxyCore));
        vm.warp(executionTimestamp + 1);
    }

    function test_failsWithNonMigrator() public {
        address randomSigner = makeAddr("RandomSigner");

        vm.expectRevert("Only a permissioned migrator can call this function");
        vm.prank(randomSigner);

        core.release.fundDeployer.executeMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_success() public {
        // Assert Dispatcher.executeMigration() will be called correctly
        vm.expectCall(
            address(core.persistent.dispatcher),
            abi.encodeWithSelector(
                core.persistent.dispatcher.executeMigration.selector, address(vaultProxyCore), bypassPrevReleaseFailure
            )
        );
        // Assert ProtocolFeeTracker.initializeForVault() will be called correctly
        vm.expectCall(
            address(core.release.protocolFeeTracker),
            abi.encodeWithSelector(core.release.protocolFeeTracker.initializeForVault.selector, address(vaultProxyCore))
        );
        // Assert ComptrollerProxy.activate() will be called
        vm.expectCall(nextComptrollerProxyAddress, abi.encodeWithSelector(IComptrollerLib.activate.selector));

        vm.prank(vaultOwner);

        core.release.fundDeployer.executeMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_successWithFailureBypass() public {
        bypassPrevReleaseFailure = true;

        // Assert Dispatcher.executeMigration() will be called correctly
        vm.expectCall(
            address(core.persistent.dispatcher),
            abi.encodeWithSelector(
                core.persistent.dispatcher.executeMigration.selector, address(vaultProxyCore), bypassPrevReleaseFailure
            )
        );
        vm.prank(vaultOwner);

        core.release.fundDeployer.executeMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_successWithMigratorCaller() public {
        vm.prank(migrator);

        core.release.fundDeployer.executeMigration({
            _vaultProxy: address(vaultProxyCore),
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }
}

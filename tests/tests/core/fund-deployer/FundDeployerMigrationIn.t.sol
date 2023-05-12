// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";
import {IVaultCore} from "tests/interfaces/internal/IVaultCore.sol";

contract FundDeployerMigrationInTest is IntegrationTest {
    bool internal bypassPrevReleaseFailure; // Don't bypass failures by default
    address internal migrator;
    address internal vaultOwner;
    IVaultCore internal vaultProxyCore;

    function setUp() public virtual override {
        setUpStandaloneEnvironment(false);

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
        IVault(address(vaultProxyCore)).setMigrator(migrator);
    }
}

contract FundDeployerCreateMigrationRequestTest is FundDeployerMigrationInTest {
    event MigrationRequestCreated(address indexed creator, address indexed vaultProxy, address comptrollerProxy);

    function test_failWithNonLiveRelease() public {
        vm.expectRevert("Release is not yet live");
        vm.prank(vaultOwner);

        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _denominationAsset: address(standardPrimitive),
            _sharesActionTimelock: 123,
            _feeManagerConfigData: "",
            _policyManagerConfigData: "",
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_failWithNonMigrator() public {
        setReleaseLive(core);

        address randomSigner = makeAddr("RandomSigner");

        vm.expectRevert("Only a permissioned migrator can call this function");
        vm.prank(randomSigner);

        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _denominationAsset: address(standardPrimitive),
            _sharesActionTimelock: 123,
            _feeManagerConfigData: "",
            _policyManagerConfigData: "",
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_success() public {
        setReleaseLive(core);

        address expectedComptrollerProxy = predictComptrollerProxyAddress(core.release.fundDeployer);

        // Define migration request params
        address migrationRequestCaller = vaultProxyCore.getOwner();
        address denominationAsset = address(standardPrimitive);
        uint256 sharesActionTimelock = 123;

        // Prepare event assertions
        expectEmit(address(core.release.fundDeployer));
        emit MigrationRequestCreated(migrationRequestCaller, address(vaultProxyCore), address(expectedComptrollerProxy));

        // Create migration request
        vm.prank(migrationRequestCaller);
        IComptroller comptrollerProxy = IComptroller(
            core.release.fundDeployer.createMigrationRequest({
                _vaultProxy: address(vaultProxyCore),
                _denominationAsset: denominationAsset,
                _sharesActionTimelock: sharesActionTimelock,
                _feeManagerConfigData: "",
                _policyManagerConfigData: "",
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

        // TODO: Assert the extensions were called correctly
    }

    function test_successWithMigratorCaller() public {
        setReleaseLive(core);

        address expectedComptrollerProxy = predictComptrollerProxyAddress(core.release.fundDeployer);

        // Prepare event assertions
        expectEmit(address(core.release.fundDeployer));
        emit MigrationRequestCreated(migrator, address(vaultProxyCore), address(expectedComptrollerProxy));

        // Create migration request
        vm.prank(migrator);
        core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _denominationAsset: address(standardPrimitive),
            _sharesActionTimelock: 123,
            _feeManagerConfigData: "",
            _policyManagerConfigData: "",
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }
}

contract FundDeployerCancelMigrationTest is FundDeployerMigrationInTest {
    address internal nextComptrollerProxyAddress;

    function setUp() public virtual override {
        super.setUp();

        // Set release live
        setReleaseLive(core);

        // Create migration request
        vm.prank(vaultOwner);
        nextComptrollerProxyAddress = core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _denominationAsset: address(standardPrimitive),
            _sharesActionTimelock: 123,
            _feeManagerConfigData: "",
            _policyManagerConfigData: "",
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });
    }

    function test_failWithNonMigrator() public {
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
        // Assert ComptrollerProxy.destructUnactivated() will be called
        vm.expectCall(nextComptrollerProxyAddress, abi.encodeWithSelector(IComptroller.destructUnactivated.selector));
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

        // Set release live
        setReleaseLive(core);

        // Create migration request
        vm.prank(vaultOwner);
        nextComptrollerProxyAddress = core.release.fundDeployer.createMigrationRequest({
            _vaultProxy: address(vaultProxyCore),
            _denominationAsset: address(standardPrimitive),
            _sharesActionTimelock: 123,
            _feeManagerConfigData: "",
            _policyManagerConfigData: "",
            _bypassPrevReleaseFailure: bypassPrevReleaseFailure
        });

        // Warp beyond the migration timelock
        (,,, uint256 executionTimestamp) =
            core.persistent.dispatcher.getMigrationRequestDetailsForVaultProxy(address(vaultProxyCore));
        vm.warp(executionTimestamp + 1);
    }

    function test_failWithNonMigrator() public {
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
        // Assert ComptrollerProxy.activate() will be called correctly
        vm.expectCall(nextComptrollerProxyAddress, abi.encodeWithSelector(IComptroller.activate.selector, true));

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

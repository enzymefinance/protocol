// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {UnitTest} from "tests/bases/UnitTest.sol";
import {MigrationOutHook} from "tests/utils/core/VaultUtils.sol";
import {DispatcherTest} from "./Dispatcher.t.sol";

import {IMigrationHookHandler} from "tests/interfaces/internal/IMigrationHookHandler.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

contract MockFundDeployer is IMigrationHookHandler {
    function invokeMigrationInCancelHook(address, address, address, address) external override {}

    function invokeMigrationOutHook(uint8, address, address, address, address) external virtual override {}
}

contract MockFailingFundDeployer is MockFundDeployer {
    MigrationOutHook internal immutable REVERTING_HOOK;

    constructor(MigrationOutHook _revertingHook) {
        REVERTING_HOOK = _revertingHook;
    }

    function invokeMigrationOutHook(uint8 _hook, address, address, address, address) external view override {
        require(_hook != uint8(REVERTING_HOOK), "test revert");
    }
}

abstract contract DispatcherVaultMigrationTest is DispatcherTest {
    string internal vaultName = "Test Vault";
    address internal dummyPrevVaultAccessor = makeAddr("DummyPrevVaultAccessor");
    address internal dummyNextVaultAccessor = makeAddr("DummyNextVaultAccessor");
    address internal mockPrevFundDeployer = address(new MockFundDeployer());
    address internal mockNextFundDeployer = address(new MockFundDeployer());
    address internal mockPrevVaultLib;
    address internal mockNextVaultLib;

    function setUp() public override {
        super.setUp();

        vm.etch(dummyPrevVaultAccessor, "empty");
        vm.etch(dummyNextVaultAccessor, "empty");

        dispatcher.setCurrentFundDeployer(mockPrevFundDeployer);

        mockPrevVaultLib = address(deployCode("MockVaultLib.sol"));
        mockNextVaultLib = address(deployCode("MockVaultLib.sol"));
    }

    function createTestVault() internal returns (address vaultProxy_) {
        vm.prank(dispatcher.getCurrentFundDeployer());
        vaultProxy_ = dispatcher.deployVaultProxy(mockPrevVaultLib, alice, dummyPrevVaultAccessor, vaultName);

        vm.label(vaultProxy_, "TestVault");
    }
}

contract DispatcherSignalMigrationTest is DispatcherVaultMigrationTest {
    event MigrationOutHookFailed(
        bytes failureReturnData,
        MigrationOutHook hook,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib
    );

    event MigrationSignaled(
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 executableTimestamp
    );

    function testCanOnlyBeCalledByCurrentFundDeployer() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(alice);
        vm.expectRevert("Only the current FundDeployer can call this function");
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);
    }

    function testDoesNotAllowNonContractVaultAccessor() public {
        address invalidVaultAccessor = makeAddr("InvalidVaultAccessor");
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert("signalMigration: Non-contract _nextVaultAccessor");
        dispatcher.signalMigration(vaultProxy, invalidVaultAccessor, mockNextVaultLib, false);
    }

    function testDoesNotAllowNonExistentVaultProxy() public {
        address nonExistentVaultProxy = makeAddr("NonExistentVaultProxy");
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert("signalMigration: _vaultProxy does not exist");
        dispatcher.signalMigration(nonExistentVaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);
    }

    function testCannotBeCalledIfVaultIsAlreadyOnCurrentVersion() public {
        address vaultProxy = createTestVault();

        vm.prank(mockPrevFundDeployer);
        vm.expectRevert("signalMigration: Can only migrate to a new FundDeployer");
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);
    }

    function testCorrectlyHandlesMigationOutHookPreSignalFailure() public {
        address failingFundDeployer = address(new MockFailingFundDeployer(MigrationOutHook.PreSignal));

        dispatcher.setCurrentFundDeployer(failingFundDeployer);
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert(formatError("MigrationOutHook.PreSignal: ", "test revert"));
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        vm.expectEmit(true, true, true, true);
        emit MigrationOutHookFailed(
            formatError("test revert"),
            MigrationOutHook.PreSignal,
            vaultProxy,
            failingFundDeployer,
            mockNextFundDeployer,
            dummyNextVaultAccessor,
            mockNextVaultLib
        );

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, true);
    }

    function testCorrectlyHandlesPostSignalMigrationOriginHookFailure() public {
        address failingFundDeployer = address(new MockFailingFundDeployer(MigrationOutHook.PostSignal));

        dispatcher.setCurrentFundDeployer(failingFundDeployer);
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert(formatError("MigrationOutHook.PostSignal: ", "test revert"));
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        vm.expectEmit(true, true, true, true);
        emit MigrationOutHookFailed(
            formatError("test revert"),
            MigrationOutHook.PostSignal,
            vaultProxy,
            failingFundDeployer,
            mockNextFundDeployer,
            dummyNextVaultAccessor,
            mockNextVaultLib
        );

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, true);
    }

    function testCorrectlySignalsMigration() public {
        address prevFundDeployer = address(new MockFundDeployer());
        address nextFundDeployer = address(new MockFundDeployer());

        dispatcher.setCurrentFundDeployer(prevFundDeployer);
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(nextFundDeployer);

        uint256 migrationTimelock = dispatcher.getMigrationTimelock();
        uint256 executableTimestamp = block.timestamp + migrationTimelock;

        vm.expectEmit(true, true, true, true);
        emit MigrationSignaled(
            vaultProxy,
            prevFundDeployer,
            nextFundDeployer,
            dummyNextVaultAccessor,
            mockNextVaultLib,
            executableTimestamp
        );

        vm.expectCall(
            prevFundDeployer,
            abi.encodeWithSelector(
                IMigrationHookHandler.invokeMigrationOutHook.selector,
                MigrationOutHook.PreSignal,
                vaultProxy,
                nextFundDeployer,
                dummyNextVaultAccessor,
                mockNextVaultLib
            )
        );

        vm.expectCall(
            prevFundDeployer,
            abi.encodeWithSelector(
                IMigrationHookHandler.invokeMigrationOutHook.selector,
                MigrationOutHook.PostSignal,
                vaultProxy,
                nextFundDeployer,
                dummyNextVaultAccessor,
                mockNextVaultLib
            )
        );

        vm.prank(nextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        (
            address detailsNextFundDeployer,
            address detailsNextVaultAccessor,
            address detailsNextVaultLib,
            uint256 detailsExecutableTimestamp
        ) = dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

        assertEq(nextFundDeployer, detailsNextFundDeployer);
        assertEq(dummyNextVaultAccessor, detailsNextVaultAccessor);
        assertEq(mockNextVaultLib, detailsNextVaultLib);
        assertEq(executableTimestamp, detailsExecutableTimestamp);
    }
}

contract DispatcherCancelMigrationTest is DispatcherVaultMigrationTest {
    event MigrationCancelled(
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 executableTimestamp
    );

    function testDoesNotAllowNonExistentMigrationRequest() public {
        address vaultProxy = createTestVault();

        vm.prank(alice);
        vm.expectRevert("cancelMigration: No migration request exists");
        dispatcher.cancelMigration(vaultProxy, false);
    }

    function testCanNotBeCancelledByArbitraryAccount() public {
        address prevFundDeployer = address(new MockFundDeployer());
        address nextFundDeployer = address(new MockFundDeployer());

        dispatcher.setCurrentFundDeployer(prevFundDeployer);
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(nextFundDeployer);

        vm.prank(nextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        vm.prank(makeAddr("NotAlice"));
        vm.expectRevert("cancelMigration: Not an allowed caller");
        dispatcher.cancelMigration(vaultProxy, false);
    }

    function testCorrectlyCancelsMigrationRequest() public {
        address prevFundDeployer = address(new MockFundDeployer());
        address nextFundDeployer = address(new MockFundDeployer());

        dispatcher.setCurrentFundDeployer(prevFundDeployer);
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(nextFundDeployer);

        vm.prank(nextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        (
            address detailsFundDeployerBeforeCancel,
            address detailsVaultAccessorBeforeCancel,
            address detailsVaultLibBeforeCancel,
            uint256 detailsExecutableTimestampBeforeCancel
        ) = dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

        vm.expectEmit(true, true, true, true);
        emit MigrationCancelled(
            vaultProxy,
            prevFundDeployer,
            detailsFundDeployerBeforeCancel,
            detailsVaultAccessorBeforeCancel,
            detailsVaultLibBeforeCancel,
            detailsExecutableTimestampBeforeCancel
        );

        vm.expectCall(
            nextFundDeployer,
            abi.encodeWithSelector(
                IMigrationHookHandler.invokeMigrationInCancelHook.selector,
                vaultProxy,
                prevFundDeployer,
                dummyNextVaultAccessor,
                mockNextVaultLib
            )
        );

        vm.prank(alice);
        dispatcher.cancelMigration(vaultProxy, false);

        (
            address detailsFundDeployerAfterCancel,
            address detailsVaultAccessorAfterCancel,
            address detailsVaultLibAfterCancel,
            uint256 detailsExecutableTimestampAfterCancel
        ) = dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

        assertEq(address(0), detailsFundDeployerAfterCancel);
        assertEq(address(0), detailsVaultAccessorAfterCancel);
        assertEq(address(0), detailsVaultLibAfterCancel);
        assertEq(uint256(0), detailsExecutableTimestampAfterCancel);
    }

    function testCorrectlyHandlesPostCancelMigrationOriginHookFailure() public {
        // TODO
    }

    function testCorrectlyHandlesPostCancelMigrationTargetHookFailure() public {
        // TODO
    }
}

contract DispatcherExecuteMigrationTest is DispatcherVaultMigrationTest {
    event MigrationExecuted(
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 executableTimestamp
    );

    function testDoesNotAllowBadVaultLib() public {
        address vaultProxy = createTestVault();
        address badVaultLib = makeAddr("BadVaultLib");
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, badVaultLib, false);

        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert();
        dispatcher.executeMigration(vaultProxy, false);
    }

    function testDoesNotAllowNonExistentMigrationRequest() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert("executeMigration: No migration request exists for _vaultProxy");
        dispatcher.executeMigration(vaultProxy, false);
    }

    function testCanOnlyBeCalledByTargetFundDeployer() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp);

        vm.prank(mockPrevFundDeployer);
        vm.expectRevert("executeMigration: Only the target FundDeployer can call this function");
        dispatcher.executeMigration(vaultProxy, false);
    }

    function testCannotBeCalledWhenTargetFundDeployerIsNoLongerValid() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert("executeMigration: The migration timelock has not elapsed");
        dispatcher.executeMigration(vaultProxy, false);

        // Warp to 5 secs prior to the timelock expiry, which should also fail.
        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp - 5);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert("executeMigration: The migration timelock has not elapsed");
        dispatcher.executeMigration(vaultProxy, false);
    }

    function testCannotBeCalledWhenMigrationTimelockHasNotBeenMetYet() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp);

        address newFundDeployer = address(new MockFundDeployer());
        dispatcher.setCurrentFundDeployer(newFundDeployer);

        vm.prank(mockNextFundDeployer);
        vm.expectRevert("executeMigration: The target FundDeployer is no longer the current FundDeployer");
        dispatcher.executeMigration(vaultProxy, false);
    }

    function testCorrectlyExecutesMigrationRequest() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp);

        (
            address detailsFundDeployerBeforeMigration,
            address detailsVaultAccessorBeforeMigration,
            address detailsVaultLibBeforeMigration,
            uint256 detailsExecutableTimestampBeforeMigration
        ) = dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

        vm.expectEmit(true, true, true, true);
        emit MigrationExecuted(
            vaultProxy,
            mockPrevFundDeployer,
            detailsFundDeployerBeforeMigration,
            detailsVaultAccessorBeforeMigration,
            detailsVaultLibBeforeMigration,
            detailsExecutableTimestampBeforeMigration
        );

        vm.expectCall(
            mockPrevFundDeployer,
            abi.encodeWithSelector(
                IMigrationHookHandler.invokeMigrationOutHook.selector,
                MigrationOutHook.PreMigrate,
                vaultProxy,
                mockNextFundDeployer,
                dummyNextVaultAccessor,
                mockNextVaultLib
            )
        );

        vm.expectCall(
            mockPrevFundDeployer,
            abi.encodeWithSelector(
                IMigrationHookHandler.invokeMigrationOutHook.selector,
                MigrationOutHook.PostMigrate,
                vaultProxy,
                mockNextFundDeployer,
                dummyNextVaultAccessor,
                mockNextVaultLib
            )
        );

        vm.prank(mockNextFundDeployer);
        dispatcher.executeMigration(vaultProxy, false);

        assertEq(mockNextVaultLib, IVault(vaultProxy).getVaultLib());
        assertEq(dummyNextVaultAccessor, IVault(vaultProxy).getAccessor());
        assertEq(dummyNextVaultAccessor, IVault(vaultProxy).getAccessor());

        (
            address detailsFundDeployerAfterMigration,
            address detailsVaultAccessorAfterMigration,
            address detailsVaultLibAfterMigration,
            uint256 detailsExecutableTimestampAfterMigration
        ) = dispatcher.getMigrationRequestDetailsForVaultProxy(vaultProxy);

        assertEq(address(0), detailsFundDeployerAfterMigration);
        assertEq(address(0), detailsVaultAccessorAfterMigration);
        assertEq(address(0), detailsVaultLibAfterMigration);
        assertEq(uint256(0), detailsExecutableTimestampAfterMigration);
    }

    function testCorrectlyHandlesPreMigrationMigrationOriginHookFailure() public {
        // TODO
    }

    function testCorrectlyHandlesPreMigrationMigrationTargetHookFailure() public {
        // TODO
    }
}

contract DispatcherHasExecutableMigrationRequestTest is DispatcherVaultMigrationTest {
    function testReturnsFalseIfVaultProxyIsNotValid() public {
        assertFalse(dispatcher.hasExecutableMigrationRequest(makeAddr("NonExistentVaultProxy")));
    }

    function testReturnsFalseIfVaultProxyHasNoMigrationRequest() public {
        address vaultProxy = createTestVault();
        assertFalse(dispatcher.hasExecutableMigrationRequest(vaultProxy));
    }

    function testReturnsFalseIfVaultProxyHasMigrationRequestButTimelockHasNotBeenMet() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        assertFalse(dispatcher.hasExecutableMigrationRequest(vaultProxy));

        // Warp to 5 secs prior to the timelock expiry, which should also return false.
        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp - 5);

        assertFalse(dispatcher.hasExecutableMigrationRequest(vaultProxy));
    }

    function testReturnsTrueIfVaultProxyHasMigrationRequestAndTimelockHasBeenMet() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp);

        assertTrue(dispatcher.hasExecutableMigrationRequest(vaultProxy));

        // Warp one day further into the future, which should still return true.
        vm.warp(block.timestamp + 86400);
        assertTrue(dispatcher.hasExecutableMigrationRequest(vaultProxy));
    }
}

contract DispatcherHasMigrationRequestTest is DispatcherVaultMigrationTest {
    function testReturnsFalseIfVaultProxyIsNotValid() public {
        assertFalse(dispatcher.hasMigrationRequest(makeAddr("NonExistentVaultProxy")));
    }

    function testReturnsFalseIfVaultProxyHasNoMigrationRequest() public {
        address vaultProxy = createTestVault();
        assertFalse(dispatcher.hasMigrationRequest(vaultProxy));
    }

    function testReturnsTrueIfVaultProxyHasMigrationRequest() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        assertTrue(dispatcher.hasMigrationRequest(vaultProxy));
    }

    function testReturnsFalseAfterMigrationHasBeenExecuted() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        uint256 executableTimestamp = block.timestamp + dispatcher.getMigrationTimelock();
        vm.warp(executableTimestamp);

        assertTrue(dispatcher.hasMigrationRequest(vaultProxy));

        vm.prank(mockNextFundDeployer);
        dispatcher.executeMigration(vaultProxy, false);

        assertFalse(dispatcher.hasMigrationRequest(vaultProxy));
    }

    function testReturnsFalseAfterMigrationHasBeenCancelled() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        assertTrue(dispatcher.hasMigrationRequest(vaultProxy));

        vm.prank(mockNextFundDeployer);
        dispatcher.cancelMigration(vaultProxy, false);

        assertFalse(dispatcher.hasMigrationRequest(vaultProxy));
    }
}

contract DispatcherGetTimelockRemainingForMigrationRequestTest is DispatcherVaultMigrationTest {
    function testReturnsZeroIfVaultProxyIsNotValid() public {
        assertEq(uint256(0), dispatcher.getTimelockRemainingForMigrationRequest(makeAddr("NonExistentVaultProxy")));
    }

    function testReturnsZeroIfVaultProxyHasNoMigrationRequest() public {
        address vaultProxy = createTestVault();
        assertEq(uint256(0), dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy));
    }

    function testReturnsRemainingTimelockIfVaultProxyHasMigrationRequest() public {
        address vaultProxy = createTestVault();
        dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

        vm.prank(mockNextFundDeployer);
        dispatcher.signalMigration(vaultProxy, dummyNextVaultAccessor, mockNextVaultLib, false);

        uint256 migrationTimelock = dispatcher.getMigrationTimelock();
        assertEq(migrationTimelock, dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy));

        // Warp to 5 seconds before the timelock expiry, which should return the remaining timelock.
        vm.warp(block.timestamp + migrationTimelock - 5);
        assertEq(uint256(5), dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy));

        // Warp to the exact timelock expiry time, which should return zero.
        vm.warp(block.timestamp + migrationTimelock);
        assertEq(uint256(0), dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy));

        // Warp one day further into the future, which should still return zero.
        vm.warp(block.timestamp + 86400);
        assertEq(uint256(0), dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy));
    }
}

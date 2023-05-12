// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {UnitTest} from "tests/bases/UnitTest.sol";
import {DeploymentUtils} from "tests/utils/core/DeploymentUtils.sol";

import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";

abstract contract DispatcherTest is UnitTest, DeploymentUtils {
    IDispatcher internal dispatcher;

    function setUp() public virtual {
        dispatcher = deployDispatcher();
    }
}

contract DispatcherConstructorTest is DispatcherTest {
    function testInitialState() public {
        assertEq(address(this), dispatcher.getOwner());
        assertEq(address(0), dispatcher.getNominatedOwner());
    }
}

contract DispatcherSetMigrationTimelockTest is DispatcherTest {
    function testDisallowsCallByRandomAddress() public {
        vm.prank(makeAddr("NotOwner"));
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.setMigrationTimelock(1);
    }

    function testDoesNotALlowSettingTimelockTwice() public {
        dispatcher.setMigrationTimelock(1);
        vm.expectRevert("setMigrationTimelock: _nextTimelock is the current timelock");
        dispatcher.setMigrationTimelock(1);
    }

    function testCorrectlyHandlesSettingNewMigrationTimelock() public {
        dispatcher.setMigrationTimelock(1);
        assertEq(1, dispatcher.getMigrationTimelock());
    }
}

contract DispatcherSetSharesTokenSymbolTest is DispatcherTest {
    event SharesTokenSymbolSet(string _nextSymbol);

    function testDisallowsCallByRandomAddress() public {
        vm.prank(makeAddr("NotOwner"));
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.setSharesTokenSymbol("TEST");
    }

    function testCorrectlyUpdatesSharesTokenSymbol() public {
        expectEmit(address(dispatcher));
        emit SharesTokenSymbolSet("TEST");

        dispatcher.setSharesTokenSymbol("TEST");
        assertEq("TEST", dispatcher.getSharesTokenSymbol());
    }
}

contract DispatcherSetCurrentFundDeployerTest is DispatcherTest {
    event CurrentFundDeployerSet(address prevFundDeployer, address nextFundDeployer);

    function testDisallowsCallByRandomAddress() public {
        vm.prank(makeAddr("NotOwner"));
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.setCurrentFundDeployer(makeAddr("NewFundDeployer"));
    }

    function testCorrectlyUpdatesCurrentFundDeployer() public {
        address dummyFundDeployer = makeAddr("DummyFundDeployer");
        vm.etch(dummyFundDeployer, "empty");

        dispatcher.setCurrentFundDeployer(dummyFundDeployer);
        assertEq(dummyFundDeployer, dispatcher.getCurrentFundDeployer());
    }

    function testDoesNotAllowEmptyCurrentFundDeployer() public {
        vm.expectRevert("setCurrentFundDeployer: _nextFundDeployer cannot be empty");
        dispatcher.setCurrentFundDeployer(address(0));
    }

    function testDoesNotAllowFundDeployerToBeNonContract() public {
        vm.expectRevert("setCurrentFundDeployer: Non-contract _nextFundDeployer");
        dispatcher.setCurrentFundDeployer(makeAddr("NotAContract"));
    }

    function testDoesNotAllowRepeatedCurrentFundDeployer() public {
        address dummyFundDeployer = makeAddr("DummyFundDeployer");
        vm.etch(dummyFundDeployer, "empty");

        dispatcher.setCurrentFundDeployer(dummyFundDeployer);
        vm.expectRevert("setCurrentFundDeployer: _nextFundDeployer is already currentFundDeployer");
        dispatcher.setCurrentFundDeployer(dummyFundDeployer);
    }

    function testCorrectlySetsNewFundDeployer() public {
        address firstDummyFundDeployer = makeAddr("FirstDummyFundDeployer");
        address secondDummyFundDeployer = makeAddr("SecondDummyFundDeployer");
        vm.etch(firstDummyFundDeployer, "empty");
        vm.etch(secondDummyFundDeployer, "empty");

        expectEmit(address(dispatcher));
        emit CurrentFundDeployerSet(address(0), firstDummyFundDeployer);

        dispatcher.setCurrentFundDeployer(firstDummyFundDeployer);
        assertEq(firstDummyFundDeployer, dispatcher.getCurrentFundDeployer());

        expectEmit(address(dispatcher));
        emit CurrentFundDeployerSet(firstDummyFundDeployer, secondDummyFundDeployer);

        dispatcher.setCurrentFundDeployer(secondDummyFundDeployer);
        assertEq(secondDummyFundDeployer, dispatcher.getCurrentFundDeployer());
    }
}

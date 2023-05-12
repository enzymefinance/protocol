// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {DispatcherTest} from "./Dispatcher.t.sol";

contract DispatcherSetNominatedOwnerTest is DispatcherTest {
    event NominatedOwnerSet(address indexed nominatedOwner);

    address internal nominatedOwner = makeAddr("NominatedOwner");

    function testHappyPath() public {
        assertEq(address(0), dispatcher.getNominatedOwner());

        expectEmit(address(dispatcher));
        emit NominatedOwnerSet(nominatedOwner);

        dispatcher.setNominatedOwner(nominatedOwner);
        assertEq(nominatedOwner, dispatcher.getNominatedOwner());
        assertEq(address(this), dispatcher.getOwner());
    }

    function testAnonCannotSet() public {
        vm.prank(nominatedOwner);
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.setNominatedOwner(nominatedOwner);
    }

    function testDoesNotAllowEmptyNextOwner() public {
        vm.expectRevert("setNominatedOwner: _nextNominatedOwner cannot be empty");
        dispatcher.setNominatedOwner(address(0));
    }

    function testDoesNotAllowIdenticalNextOwner() public {
        vm.expectRevert("setNominatedOwner: _nextNominatedOwner is already the owner");
        dispatcher.setNominatedOwner(address(this));
    }

    function testDoesNotAllowRepeatedNomination() public {
        dispatcher.setNominatedOwner(nominatedOwner);

        vm.expectRevert("setNominatedOwner: _nextNominatedOwner is already nominated");
        dispatcher.setNominatedOwner(nominatedOwner);
    }
}

contract DispatcherRemoveNominatedOwnerTest is DispatcherTest {
    event NominatedOwnerRemoved(address indexed nominatedOwner);

    address internal nominatedOwner = makeAddr("NominatedOwner");

    function testHappyPath() public {
        dispatcher.setNominatedOwner(nominatedOwner);

        expectEmit(address(dispatcher));
        emit NominatedOwnerRemoved(nominatedOwner);

        dispatcher.removeNominatedOwner();
        assertEq(address(this), dispatcher.getOwner());
    }

    function testAnonCannotRemove() public {
        dispatcher.setNominatedOwner(nominatedOwner);

        vm.prank(nominatedOwner);
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.removeNominatedOwner();
    }
}

contract DispatcherClaimOwnershipTest is DispatcherTest {
    event OwnershipTransferred(address indexed prevOwner, address indexed nextOwner);

    address internal nominatedOwner = makeAddr("NominatedOwner");

    function testHappyPath() public {
        dispatcher.setNominatedOwner(nominatedOwner);

        expectEmit(address(dispatcher));
        emit OwnershipTransferred(address(this), nominatedOwner);

        vm.prank(nominatedOwner);
        dispatcher.claimOwnership();

        assertEq(nominatedOwner, dispatcher.getOwner());
        assertEq(address(0), dispatcher.getNominatedOwner());
    }

    function testAnonCannotClaimOwnership() public {
        dispatcher.setNominatedOwner(address(1337));

        vm.expectRevert("claimOwnership: Only the nominatedOwner can call this function");
        dispatcher.claimOwnership();
    }
}

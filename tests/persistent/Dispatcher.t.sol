// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "forge-std/console2.sol";

import {Test} from "forge-std/Test.sol";
import {MockVaultLib} from "@enzyme/mocks/MockVaultLib.sol";
import {Dispatcher} from "@enzyme/persistent/dispatcher/Dispatcher.sol";
import {IMigrationHookHandler} from "@enzyme/persistent/dispatcher/IMigrationHookHandler.sol";

abstract contract DispatcherTest is Test {
    Dispatcher internal dispatcher;

    function addr(string memory _name) public pure returns (address) {
        return address(bytes20(uint160(uint256(keccak256(bytes(_name))))));
    }

    function setUp() public virtual {
        dispatcher = new Dispatcher();
    }
}

contract ConstructorTest is DispatcherTest {
    function testInitialState() public {
        assertEq(address(this), dispatcher.getOwner());
        assertEq(address(0), dispatcher.getNominatedOwner());
    }
}

contract SetNominatedOwnerTest is DispatcherTest {
    event NominatedOwnerSet(address indexed nominatedOwner);

    function testHappyPath() public {
        assertEq(address(0), dispatcher.getNominatedOwner());

        vm.expectEmit(true, true, true, true);
        emit NominatedOwnerSet(address(1337));

        dispatcher.setNominatedOwner(address(1337));
        assertEq(address(1337), dispatcher.getNominatedOwner());
        assertEq(address(this), dispatcher.getOwner());
    }

    function testAnonCannotSet() public {
        vm.prank(address(1337));
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.setNominatedOwner(address(1337));
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
        dispatcher.setNominatedOwner(address(1337));

        vm.expectRevert("setNominatedOwner: _nextNominatedOwner is already nominated");
        dispatcher.setNominatedOwner(address(1337));
    }
}

contract RemoveNominatedOwnerTest is DispatcherTest {
    event NominatedOwnerRemoved(address indexed nominatedOwner);

    function testHappyPath() public {
        dispatcher.setNominatedOwner(address(1337));

        vm.expectEmit(true, true, true, true);
        emit NominatedOwnerRemoved(address(1337));

        dispatcher.removeNominatedOwner();
        assertEq(address(this), dispatcher.getOwner());
    }

    function testAnonCannotRemove() public {
        dispatcher.setNominatedOwner(address(1337));

        vm.prank(address(1337));
        vm.expectRevert("Only the contract owner can call this function");
        dispatcher.removeNominatedOwner();
    }
}

contract ClaimOwnershipTest is DispatcherTest {
    event OwnershipTransferred(address indexed prevOwner, address indexed nextOwner);

    function testHappyPath() public {
        dispatcher.setNominatedOwner(address(1337));

        vm.expectEmit(true, true, true, true);
        emit OwnershipTransferred(address(this), address(1337));

        vm.prank(address(1337));
        dispatcher.claimOwnership();

        assertEq(address(1337), dispatcher.getOwner());
        assertEq(address(0), dispatcher.getNominatedOwner());
    }

    function testAnonCannotClaimOwnership() public {
        dispatcher.setNominatedOwner(address(1337));

        vm.expectRevert("claimOwnership: Only the nominatedOwner can call this function");
        dispatcher.claimOwnership();
    }
}

contract DeployVaultProxyTest is DispatcherTest {
    event AccessorSet(address prevAccessor, address nextAccessor);
    event OwnerSet(address prevOwner, address nextOwner);
    event VaultLibSet(address prevVaultLib, address nextVaultLib);
    event VaultProxyDeployed(
        address indexed fundDeployer,
        address indexed owner,
        address vaultProxy,
        address indexed vaultLib,
        address vaultAccessor,
        string fundName
    );

    function setUp() public override {
        super.setUp();

        vm.etch(addr("dummy vault accessor"), "Dummy Vault Accessor");
        vm.etch(addr("dummy fund deployer"), "Dummy Fund Deployer");
        dispatcher.setCurrentFundDeployer(addr("dummy fund deployer"));
    }

    function testHappyPath() public {
        address mocKVaultLib = address(new MockVaultLib());

        vm.expectEmit(true, true, true, true);
        emit AccessorSet(address(0), addr("dummy vault accessor"));

        vm.expectEmit(true, true, true, true);
        emit OwnerSet(address(0), addr("alice"));

        vm.expectEmit(true, true, true, true);
        emit VaultLibSet(address(0), mocKVaultLib);

        vm.expectEmit(true, true, true, true);
        emit VaultProxyDeployed(
            addr("dummy fund deployer"),
            addr("alice"),
            computeCreateAddress(address(dispatcher), 1),
            mocKVaultLib,
            addr("dummy vault accessor"),
            "Dummy Fund"
        );

        vm.prank(addr("dummy fund deployer"));
        address vault = dispatcher.deployVaultProxy(
            mocKVaultLib,
            addr("alice"),
            addr("dummy vault accessor"),
            "Dummy Fund"
        );

        assertEq(addr("dummy fund deployer"), dispatcher.getFundDeployerForVaultProxy(vault));
        assertEq(address(dispatcher), MockVaultLib(vault).getCreator());
        assertEq(addr("dummy vault accessor"), MockVaultLib(vault).getAccessor());
        assertEq(addr("alice"), MockVaultLib(vault).getOwner());
        assertEq(address(0), MockVaultLib(vault).getMigrator());
        assertEq("Dummy Fund", MockVaultLib(vault).name());
        assertEq("", MockVaultLib(vault).symbol());
        assertEq(uint256(18), MockVaultLib(vault).decimals());
    }

    function testDoesNotAllowBadVaultLib() public {
        vm.prank(addr("dummy fund deployer"));

        vm.expectRevert();
        dispatcher.deployVaultProxy(
            addr("dummy vault lib"),
            addr("alice"),
            addr("dummy vault accessor"),
            "Dummy Fund"
        );
    }

    function testDoesNotAllowNonContractVaultAccessor() public {
        vm.prank(addr("dummy fund deployer"));

        vm.expectRevert("deployVaultProxy: Non-contract _vaultAccessor");
        dispatcher.deployVaultProxy(
            addr("dummy vault lib"),
            addr("alice"),
            addr("non-contract vault accessor"),
            "Dummy Fund"
        );
    }
}

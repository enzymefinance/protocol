// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IMultiCallAccountMixinHarness} from "tests/interfaces/internal/IMultiCallAccountMixinHarness.sol";

contract MultiCallAccountTest is IntegrationTest {
    event OwnerSet(address nextOwner);

    IMultiCallAccountMixinHarness multiCallAccount;
    address owner;
    IMultiCallAccountMixinHarness.Call[] calls;

    function setUp() public override {
        setUpStandaloneEnvironment();

        multiCallAccount = __deployAccount();

        // Set the owner
        owner = makeAddr("Owner");
        multiCallAccount.exposed_setOwner(owner);

        // Define some calls to execute
        address target1 = makeAddr("Target1");
        address target2 = makeAddr("Target2");
        bytes memory data1 = "MoreThanFourBytes";
        bytes memory data2 = bytes.concat(data1, "2");
        calls.push(IMultiCallAccountMixinHarness.Call({target: target1, data: data1}));
        calls.push(IMultiCallAccountMixinHarness.Call({target: target2, data: data2}));

        // Make contract calls never revert with the expected payloads
        vm.mockCall({callee: target1, data: data1, returnData: ""});
        vm.mockCall({callee: target2, data: data2, returnData: "test"});
    }

    function __deployAccount() internal returns (IMultiCallAccountMixinHarness account_) {
        // Address listId that always returns false
        uint256 gsnTrustedForwardersAddressListId = 0;

        return IMultiCallAccountMixinHarness(
            deployCode(
                "MultiCallAccountMixinHarness.sol",
                abi.encode(core.persistent.addressListRegistry, gsnTrustedForwardersAddressListId)
            )
        );
    }

    // TESTS

    function test_executeCalls_failsWithUnauthorizedCaller() public {
        address randomCaller = makeAddr("RandomCaller");

        vm.prank(randomCaller);
        vm.expectRevert(IMultiCallAccountMixinHarness.Unauthorized.selector);
        multiCallAccount.executeCalls(calls);
    }

    function test_executeCalls_success() public {
        vm.prank(owner);
        multiCallAccount.executeCalls(calls);
    }

    function test_exposed_setOwner() public {
        address nextOwner = makeAddr("NextOwner");

        // Pre-assert event
        expectEmit(address(multiCallAccount));
        emit OwnerSet(nextOwner);

        multiCallAccount.exposed_setOwner(nextOwner);

        // Assert storage update
        assertEq(multiCallAccount.getOwner(), nextOwner);
    }
}

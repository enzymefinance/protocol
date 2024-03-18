// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IGSNRecipientMixinHarness} from "tests/interfaces/internal/IGSNRecipientMixinHarness.sol";

contract GSNRecipientMixinTest is IntegrationTest {
    address trustedForwarder = makeAddr("TrustedForwarder");
    IGSNRecipientMixinHarness gsnRecipient;

    function setUp() public override {
        setUpStandaloneEnvironment();

        (uint256 listId,) = createRegisteredAddressList({
            _addressListRegistry: core.persistent.addressListRegistry,
            _item: trustedForwarder
        });

        gsnRecipient = __deployGSNRecipient({_trustedForwardersListId: listId});
    }

    // DEPLOYMENT

    function __deployGSNRecipient(uint256 _trustedForwardersListId)
        private
        returns (IGSNRecipientMixinHarness gsnRecipient_)
    {
        return IGSNRecipientMixinHarness(
            deployCode(
                "GSNRecipientMixinHarness.sol",
                abi.encode(core.persistent.addressListRegistry, _trustedForwardersListId)
            )
        );
    }

    // TESTS

    function test_exposed_isGSNTrustedForwarder_successWithRandomUser() public {
        address randomUser = makeAddr("RandomUser");

        assertFalse(
            gsnRecipient.exposed_isGSNTrustedForwarder(randomUser), "Random user recognized as trusted forwarder"
        );
    }

    function test_exposed_isGSNTrustedForwarder_successWithTrustedForwarder() public {
        assertTrue(gsnRecipient.exposed_isGSNTrustedForwarder(trustedForwarder), "Trusted forwarder not recognized");
    }

    function test_exposed_msgSender_successWithRandomUser() public {
        address randomUser = makeAddr("RandomUser");

        vm.prank(randomUser);
        assertEq(gsnRecipient.exposed_msgSender(), randomUser, "Random user not recognized as msg.sender");
    }

    function test_exposed_msgSender_successWithTrustedForwarder() public {
        address actualSender = makeAddr("ActualSender");

        // Must make low-level call to pass sender in extra data
        vm.prank(trustedForwarder);
        (, bytes memory returnData) = address(gsnRecipient).call(
            abi.encodeWithSelector(IGSNRecipientMixinHarness.exposed_msgSender.selector, actualSender)
        );
        address canonicalSender = abi.decode(returnData, (address));

        assertEq(canonicalSender, actualSender, "Actual sender not recognized");
    }
}

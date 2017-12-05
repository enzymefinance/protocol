pragma solidity ^0.4.17;

import "ds-test/test.sol";
import "./Compliance.sol";


contract ComplianceTest is DSTest {

    Compliance participation;
    uint numberOfShares = 1;
    uint offeredValue = 1;
    address mockAddress = 0xAA959664FE49c5734748d80d11805c3909d9C147;

    function setUp() {
        participation = new Compliance();
    }

    // subscribe not permitted by default, but redeem permitted by default
    function testDefaultPermissions() {
        bool subscribePermitted = participation.isSubscriptionPermitted(mockAddress, numberOfShares, offeredValue);
        bool redeemPermitted = participation.isRedemptionPermitted(mockAddress, numberOfShares, offeredValue);
        assert(!subscribePermitted);
        assert(redeemPermitted);
    }

    function testAddPermissions() {
        participation.attestForIdentity(mockAddress);
        bool subscribePermitted = participation.isSubscriptionPermitted(mockAddress, numberOfShares, offeredValue);
        assert(subscribePermitted);
    }
}

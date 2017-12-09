pragma solidity ^0.4.19;

import "./assets/PreminedAsset.sol";

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
    function test_defaultPermissions() {
        bool subscribePermitted = participation.isSubscriptionPermitted(mockAddress, numberOfShares, offeredValue);
        bool redeemPermitted = participation.isRedemptionPermitted(mockAddress, numberOfShares, offeredValue);

        assert(!subscribePermitted);
        assert(redeemPermitted);
    }

    function test_addAndRemovePermissions() {
        participation.attestForIdentity(mockAddress);
        bool subscribePermitted = participation.isSubscriptionPermitted(mockAddress, numberOfShares, offeredValue);

        assert(subscribePermitted);
        
        participation.removeAttestation(mockAddress);
        subscribePermitted = participation.isSubscriptionPermitted(mockAddress, numberOfShares, offeredValue);

        assert(!subscribePermitted);
    }
}

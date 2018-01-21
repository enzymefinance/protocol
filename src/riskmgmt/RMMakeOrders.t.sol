pragma solidity ^0.4.19;

import "ds-test/test.sol";
import "ds-math/math.sol";
import "./RMMakeOrders.sol";


contract RMMakeOrdersTests is DSTest {

    RMMakeOrders riskMgmt = new RMMakeOrders();
    address sellAsset = 0x72977914288a6Becbf86deECb606Bf9cF4fA0228;
    address buyAsset = 0x585b1610aFf36237354429e3bf75cb680b4780B8;
    uint buyQuantity = 10;
    uint sellQuantity = 10;

    function test_smallDeviationPermitted() {
        bool allowed;
        // 0% deviation
        allowed = riskMgmt.isMakePermitted(
            10000,
            10000,
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
        assert(allowed);
        // 5% deviation
        allowed = riskMgmt.isMakePermitted(
            9500,
            10000,
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
        assert(allowed);
        // 9.99% deviation
        allowed = riskMgmt.isMakePermitted(
            9001,
            10000,
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
        assert(allowed);
    }

    function test_largeDeviationNotPermitted() {
        bool allowed;
        // 10.01% deviation
        allowed = riskMgmt.isMakePermitted(
            8999,
            10000,
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
        assert(!allowed);
        // 50% deviation
        allowed = riskMgmt.isMakePermitted(
            5000,
            10000,
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
        assert(!allowed);
    }
}

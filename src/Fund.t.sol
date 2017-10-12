pragma solidity ^0.4.11;

import "ds-test/test.sol";
import "./datafeeds/DataFeed.sol";
import "./assets/PreminedAsset.sol"; import "./assets/EtherToken.sol";
import "./exchange/thirdparty/SimpleMarket.sol";
import "./sphere/Sphere.sol";
import "./participation/Participation.sol";
import "./riskmgmt/RiskMgmt.sol";
import "./Fund.sol";


contract DataFeedTest is DSTest {
    DataFeed datafeed;
    EtherToken etherToken;
    Fund fund;
    Participation participation;
    PreminedAsset melonToken;
    RiskMgmt riskManagement;
    SimpleMarket simpleMarket;
    Sphere sphere;

    // constants
    string FUND_NAME = "My Fund";
    uint INTERVAL = 0;
    uint VALIDITY = 60;
    uint MELON_DECIMALS = 18;
    uint PREMINED_AMOUNT = 10 ** 28;
    uint MANAGEMENT_REWARD = 0;
    uint PERFORMANCE_REWARD = 0;
    address MANAGER_ADDRESS = this;

    // mock data
    uint inputEtherTokenPrice = 4152823920265781000;
    uint inputMelonTokenPrice = 1000000000000000000;
    uint mockQuantity = 1 ether;

    function setUp() {
        melonToken = new PreminedAsset("Melon Token", "MLN-T", MELON_DECIMALS, PREMINED_AMOUNT);
        etherToken = new EtherToken();
        datafeed = new DataFeed(melonToken, INTERVAL, VALIDITY);
        simpleMarket = new SimpleMarket();
        sphere = new Sphere(datafeed, simpleMarket);
        participation = new Participation();
        fund = new Fund(
            MANAGER_ADDRESS,
            FUND_NAME,
            melonToken,
            MANAGEMENT_REWARD,
            PERFORMANCE_REWARD,
            melonToken,
            participation,
            riskManagement,
            sphere
        );
    }

    function testVariablesSetCorrectly() {
        var returnedName = fund.getName();
        uint returnedDecimals = fund.getDecimals();
        var (returnedDatafeed, returnedExchange, returnedParticipation, returnedRiskMgmt) = fund.getModules();
        uint stake = fund.getStake();

        assertEq(returnedDatafeed, datafeed);
        assertEq(returnedExchange, simpleMarket);
        assertEq(returnedParticipation, participation);
        assertEq(returnedRiskMgmt, riskManagement);
        //assertEq(returnedName, FUND_NAME); //TODO: uncomment when assertEq implemented for strings
        assertEq(returnedDecimals, MELON_DECIMALS);
        assertEq(stake, 0);
    }

    function testToggles() {
        bool preSubscriptionAllowed = fund.isSubscribeAllowed();
        bool preRedemptionAllowed = fund.isRedeemAllowed();
        fund.toggleSubscription();
        fund.toggleRedemption();
        bool postSubscriptionAllowed = fund.isSubscribeAllowed();
        bool postRedemptionAllowed = fund.isRedeemAllowed();

        assert(preSubscriptionAllowed);
        assert(preRedemptionAllowed);
        assert(!postSubscriptionAllowed);
        assert(!postRedemptionAllowed);
    }

    function testShutDown() {
        fund.shutDown();
        bool fundShutDown = fund.isShutDown();

        assert(fundShutDown);
    }

// TODO: enable these tests when we can update datafeed from within EVM.
//       This depends on github.com/dapphub/ds-test/issues/5
//    function testRequestsFromUnapprovedParties() {
//        var (erroredOnUnapprovedSubscribeRequest, ) = fund.requestSubscription(mockQuantity, mockQuantity, mockQuantity);
//        var (erroredOnUnapprovedRedeemRequest, ) = fund.requestRedemption(mockQuantity, mockQuantity, mockQuantity);
//
//        assert(erroredOnUnapprovedSubscribeRequest);
//        assert(!erroredOnUnapprovedRedeemRequest);    // no initial approval needed for redeem
//
//    }
//
//    function testRequestFromApprovedParties() {
//        participation.attestForIdentity(this);
//        var (erroredOnApprovedSubscribeRequest, ) = fund.requestSubscription(mockQuantity, mockQuantity, mockQuantity);
//        var (erroredOnApprovedRedeemRequest, ) = fund.requestRedemption(mockQuantity, mockQuantity, mockQuantity);
//
//        assert(!erroredOnApprovedSubscribeRequest);
//        assert(!erroredOnApprovedRedeemRequest);
//    }
}

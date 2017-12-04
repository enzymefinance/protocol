pragma solidity ^0.4.17;

import "ds-test/test.sol";
import "./pricefeeds/PriceFeed.sol";
import "./assets/PreminedAsset.sol"; import "./assets/EtherToken.sol";
import "./exchange/thirdparty/SimpleMarket.sol";
import "./sphere/Sphere.sol";
import "./participation/Participation.sol";
import "./riskmgmt/RiskMgmt.sol";
import "./Fund.sol";


contract FundTest is DSTest {
    PriceFeed datafeed;
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
    string MELON_NAME = "Melon Token";
    string MELON_SYMBOL = "MLN-T";
    string MELON_URL = "https://www.melonport.com";
    bytes32 MOCK_IPFS_HASH = 0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b;
    bytes32 MOCK_CHAIN_ID = 0xd8344c361317e3736173f8da91dec3ca1de32f3cc0a895fd6363fbc20fd21985;
    address MOCK_BREAK_IN = 0x2186C5EaAf6CbF55BF1b9cD8130D8a6A71E4486a;
    address MOCK_BREAK_OUT = 0xd9AE70149D256D4645c03aB9D5423A1B70d8804d;

    // mock data
    uint inputEtherTokenPrice = 4152823920265781000;
    uint inputMelonTokenPrice = 1000000000000000000;
    uint mockQuantity = 1 ether;

    //function setUp() {
    //    melonToken = new PreminedAsset("Melon Token", "MLN-T", MELON_DECIMALS, PREMINED_AMOUNT);
    //    etherToken = new EtherToken();
    //    datafeed = new PriceFeed(melonToken, INTERVAL, VALIDITY);
    //    simpleMarket = new SimpleMarket();
    //    sphere = new Sphere(datafeed, simpleMarket);
    //    participation = new Participation();
    //    fund = new Fund(
    //        MANAGER_ADDRESS,
    //        FUND_NAME,
    //        melonToken,
    //        MANAGEMENT_REWARD,
    //        PERFORMANCE_REWARD,
    //        melonToken,
    //        participation,
    //        riskManagement,
    //        sphere
    //    );
    //}

    //function testVariablesSetCorrectly() {
    //    var returnedName = fund.getName();
    //    uint returnedDecimals = fund.getDecimals();
    //    var (returnedDatafeed, returnedExchange, returnedParticipation, returnedRiskMgmt) = fund.getModules();
    //    uint stake = fund.getStake();

    //    assertEq(returnedDatafeed, datafeed);
    //    assertEq(returnedExchange, simpleMarket);
    //    assertEq(returnedParticipation, participation);
    //    assertEq(returnedRiskMgmt, riskManagement);
    //    //assertEq(returnedName, FUND_NAME); //TODO: uncomment when assertEq implemented for strings
    //    assertEq(returnedDecimals, MELON_DECIMALS);
    //    assertEq(stake, 0);
    //}

    //function testToggles() {
    // Change this to enable and disable pattern as toggle function is depracated
    //    bool preSubscriptionAllowed = fund.isSubscribeAllowed();
    //    bool preRedemptionAllowed = fund.isRedeemAllowed();
    //    fund.toggleSubscription();
    //    fund.toggleRedemption();
    //    bool postSubscriptionAllowed = fund.isSubscribeAllowed();
    //    bool postRedemptionAllowed = fund.isRedeemAllowed();

    //    assert(preSubscriptionAllowed);
    //    assert(preRedemptionAllowed);
    //    assert(!postSubscriptionAllowed);
    //    assert(!postRedemptionAllowed);
    //}

    //function testShutDown() {
    //    fund.shutDown();
    //    bool fundShutDown = fund.isShutDown();

    //    assert(fundShutDown);
    //}

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

pragma solidity ^0.4.19;

import "ds-test/test.sol";
import "ds-weth/weth9.sol";
import "ds-token/token.sol";
import "./pricefeeds/PriceFeed.sol";
import "./exchange/thirdparty/SimpleMarket.sol";
import "./compliance/Compliance.sol";
import "./riskmgmt/RiskMgmt.sol";
import "./Fund.sol";


contract FundTest is DSTest {
    PriceFeed datafeed;
    WETH9_ weth;
    Fund fund;
    Compliance participation;
    DSToken melonToken;
    RiskMgmt riskManagement;
    SimpleMarket simpleMarket;

    // constants
    string FUND_NAME = "My Fund";
    uint INTERVAL = 0;
    uint VALIDITY = 60;
    uint MELON_DECIMALS = 18;
    uint MINTED_AMOUNT = 10 ** 28;
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
    uint inputWethPrice = 4152823920265781000;
    uint inputMelonTokenPrice = 1000000000000000000;
    uint mockQuantity = 1 ether;

    //function setUp() {
    //    melonToken = new DSToken("MLN-T");
    //    melonToken.mint(MINTED_AMOUNT);
    //    weth = new WETH9_();
    //    weth.deposit.value(100 ether)();
    //    datafeed = new PriceFeed(melonToken, INTERVAL, VALIDITY);
    //    simpleMarket = new SimpleMarket();
    //    participation = new Compliance();
    //    fund = new Fund(
    //        MANAGER_ADDRESS,
    //        FUND_NAME,
    //        melonToken,
    //        MANAGEMENT_REWARD,
    //        PERFORMANCE_REWARD,
    //        melonToken,
    //        participation,
    //        riskManagement,
    //        datafeed,
    //        simpleMarket
    //    );
    //}

    //function testVariablesSetCorrectly() {
    //    var returnedName = fund.getName();
    //    uint returnedDecimals = fund.getDecimals();
    //    var (returnedDatafeed, returnedExchange, returnedCompliance, returnedRiskMgmt) = fund.getModules();
    //    uint stake = fund.getStake();

    //    assertEq(returnedDatafeed, datafeed);
    //    assertEq(returnedExchange, simpleMarket);
    //    assertEq(returnedCompliance, participation);
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

    uint mockGav = 5000000;
    uint totalSupply = 10000;
    uint performanceRate = 10 ** 13; // 1% of performance
    uint managementRate = 38580247; // 10% every 30 days
    uint divisor = 10 ** 15;
    uint secondsInMonth = 60 * 60 * 24 * 30;  // 30 days

    // function testZeroRewardRates() {
    //     int mockPriceDelta = 500;
    //     uint managementReward = rewards.managementReward(0, secondsInMonth, mockGav, divisor);
    //     uint performanceReward = rewards.performanceReward(0, mockPriceDelta, totalSupply, divisor);

    //     assertEq(managementReward, 0);
    //     assertEq(performanceReward, 0);
    // }

    // function testManagementReward() {
    //     uint expectedMonthlyReward = mockGav / 10;  // expect 10% of GAV after one month
    //     uint oneMonthReward = rewards.managementReward(managementRate, secondsInMonth, mockGav, divisor);
    //     uint twoMonthReward = rewards.managementReward(managementRate, secondsInMonth * 2, mockGav, divisor);
    //     uint threeMonthReward = rewards.managementReward(managementRate, secondsInMonth * 3, mockGav, divisor);
    //     uint sevenMonthReward = rewards.managementReward(managementRate, secondsInMonth * 7, mockGav, divisor);

    //     assertEq(oneMonthReward, expectedMonthlyReward);
    //     assertEq(twoMonthReward, expectedMonthlyReward * 2);
    //     assertEq(threeMonthReward, expectedMonthlyReward * 3);
    //     assertEq(sevenMonthReward, expectedMonthlyReward * 7);
    // }

    // function testPerformanceReward() {
    //     int deltaPrice1 = 500;
    //     uint expectedReward1 = uint(deltaPrice1) / 100 * totalSupply;
    //     int deltaPrice2 = -1000;
    //     uint expectedReward2 = 0;
    //     int deltaPrice3 = 0;
    //     uint expectedReward3 = 0;
    //     int deltaPrice4 = 1450000;
    //     uint expectedReward4 = uint(deltaPrice4) / 100 * totalSupply;
    //     uint reward1 = rewards.performanceReward(performanceRate, deltaPrice1, totalSupply, divisor);
    //     uint reward2 = rewards.performanceReward(performanceRate, deltaPrice2, totalSupply, divisor);
    //     uint reward3 = rewards.performanceReward(performanceRate, deltaPrice3, totalSupply, divisor);
    //     uint reward4 = rewards.performanceReward(performanceRate, deltaPrice4, totalSupply, divisor);

    //     assertEq(reward1, expectedReward1);
    //     assertEq(reward2, expectedReward2);
    //     assertEq(reward3, expectedReward3);
    //     assertEq(reward4, expectedReward4);
    // }
}

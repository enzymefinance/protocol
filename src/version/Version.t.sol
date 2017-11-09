pragma solidity ^0.4.11;

import "ds-test/test.sol";
import "../datafeeds/DataFeed.sol";
import "../system/Governance.sol";
import "../participation/Participation.sol";
import "../assets/PreminedAsset.sol";
import "../riskmgmt/RiskMgmt.sol";
import "../exchange/thirdparty/SimpleMarket.sol";
import "../sphere/Sphere.sol";
import "../Fund.sol";
import "./Version.sol";


contract VersionTest is DSTest {
    DataFeed datafeed;
    Governance governance;
    Participation participation;
    PreminedAsset melonToken;
    RiskMgmt riskMgmt;
    SimpleMarket simpleMarket;
    Sphere sphere;
    Version version;

    // constants
    string FUND_NAME = "My Fund";
    string VERSION_NUMBER = "1.2.3";
    uint INTERVAL = 0;
    uint VALIDITY = 60;
    uint MELON_DECIMALS = 18;
    uint PREMINED_AMOUNT = 10 ** 28;
    uint MANAGEMENT_REWARD = 0;
    uint PERFORMANCE_REWARD = 0;
    address MANAGER_ADDRESS = this;
    uint8 v = 28;
    bytes32 r = 0x325088a245d1d91855570677e222a9c1d7bdbefb69245a383e1d29414013ed9f;
    bytes32 s = 0x4c53315f5a99f39a3d753fba87aba6c021804c3be305a084f60d74ddd38b1e0e;

//TODO: uncomment these tests when ds-test issue is resolved:
//      https://github.com/dapphub/ds-test/issues/6
    function setUp() {
        governance = new Governance(new address[](0), 0, 1000000);
        melonToken = new PreminedAsset("Melon Token", "MLN-T", MELON_DECIMALS, PREMINED_AMOUNT);
        version = new Version(VERSION_NUMBER, governance, melonToken);
        datafeed = new DataFeed(melonToken, INTERVAL, VALIDITY);
        riskMgmt = new RiskMgmt();
        simpleMarket = new SimpleMarket();
        sphere = new Sphere(datafeed, simpleMarket);
        participation = new Participation();
    }

    function testSetupFund() {
        version.setupFund(
            FUND_NAME,
            melonToken,
            MANAGEMENT_REWARD,
            PERFORMANCE_REWARD,
            participation,
            riskMgmt,
            sphere,
            v,
            r,
            s
        );
        uint fundId = version.getLastFundId();
        address fundAddressFromManager = version.getFundByManager(MANAGER_ADDRESS);
        address fundAddressFromId = version.getFundById(fundId);

        assertEq(fundAddressFromId, fundAddressFromManager);
        assertEq(fundId, 0);
    }

    function testShutdownFund() {
        version.setupFund(
            FUND_NAME,
            melonToken,
            MANAGEMENT_REWARD,
            PERFORMANCE_REWARD,
            participation,
            riskMgmt,
            sphere,
            v,
            r,
            s
        );
        uint fundId = version.getLastFundId();
        address fundAddress = version.getFundById(fundId);
        Fund fund = Fund(fundAddress);
        version.shutDownFund(fundId);
        bool fundIsShutDown = fund.isShutDown();

        assert(fundIsShutDown);
    }
}

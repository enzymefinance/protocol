pragma solidity ^0.4.17;

import "ds-test/test.sol";
import "./DataFeed.sol";
import "../assets/PreminedAsset.sol";
import "../assets/EtherToken.sol";


contract DataFeedTest is DSTest {
    DataFeed datafeed;
    PreminedAsset melonToken;
    EtherToken etherToken;

    // constants
    uint INTERVAL = 0;
    uint VALIDITY = 60;
    uint MELON_DECIMALS = 18;
    uint PREMINED_AMOUNT = 10 ** 28;

    // mock data
    uint inputEtherTokenPrice = 4152823920265781000;
    uint inputMelonTokenPrice = 1000000000000000000;

    function setUp() {
        melonToken = new PreminedAsset("Melon Token", "MLN-T", MELON_DECIMALS, PREMINED_AMOUNT);
        etherToken = new EtherToken();
        datafeed = new DataFeed(melonToken, INTERVAL, VALIDITY);
    }

    function testVariablesSetCorrectly() {
        address quoteAsset = datafeed.getQuoteAsset();
        uint returnedInterval = datafeed.getInterval();
        uint returnedValidity = datafeed.getValidity();

        assertEq(quoteAsset, melonToken);
        assertEq(returnedInterval, INTERVAL);
        assertEq(returnedValidity, VALIDITY);
    }

    function testFailGetPriceBeforeSet() {
        datafeed.getPrice(etherToken);
    }

// TODO: uncomment when dapphub/ds-test#5 is resolved
//    function testUpdateAndGetPrice() {
//        address[] storage assetArray;
//        uint[] storage priceArray;
//        assetArray.push(etherToken);
//        assetArray.push(melonToken);
//        priceArray.push(inputEtherTokenPrice);
//        priceArray.push(inputMelonTokenPrice);
//
//        datafeed.update(assetArray, priceArray);
//        uint returnedEtherTokenPrice = datafeed.getPrice(etherToken);
//        uint returnedMelonTokenPrice = datafeed.getPrice(melonToken);
//
//        assertEq(returnedEtherTokenPrice, inputEtherTokenPrice);
//        assertEq(returnedMelonTokenPrice, inputMelonTokenPrice);
//    }
}

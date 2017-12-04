pragma solidity ^0.4.17;

import "ds-test/test.sol";
import "./PriceFeed.sol";
import "../assets/PreminedAsset.sol";
import "../assets/EtherToken.sol";


contract PriceFeedTest is DSTest {
    PriceFeed pricefeed;
    PreminedAsset melonToken;
    EtherToken etherToken;

    // constants
    uint INTERVAL = 0;
    uint VALIDITY = 60;
    string MELON_NAME = "Melon Token";
    string MELON_SYMBOL = "MLN-T";
    uint MELON_DECIMALS = 18;
    string MELON_URL = "https://www.melonport.com";
    string MOCK_IPFS_HASH = "QmWHyrPWQnsz1wxHR219ooJDYTvxJPyZuDUPSDpdsAov1S";
    bytes32 MOCK_CHAIN_ID = 0xd8344c361317e3736173f8da91dec3ca1de32f3cc0a895fd6363fbc20fd21985;
    address MOCK_BREAK_IN = 0x2186C5EaAf6CbF55BF1b9cD8130D8a6A71E4486a;
    address MOCK_BREAK_OUT = 0xd9AE70149D256D4645c03aB9D5423A1B70d8804d;

    uint PREMINED_AMOUNT = 10 ** 28;

    // mock data
    uint inputEtherTokenPrice = 4152823920265781000;
    uint inputMelonTokenPrice = 1000000000000000000;

    function setUp() {
        melonToken = new PreminedAsset(MELON_NAME, MELON_SYMBOL, MELON_DECIMALS, PREMINED_AMOUNT);
        etherToken = new EtherToken();
        pricefeed = new PriceFeed(melonToken, MELON_NAME, MELON_SYMBOL, MELON_DECIMALS, MELON_URL, MOCK_IPFS_HASH, MOCK_CHAIN_ID, MOCK_BREAK_IN, MOCK_BREAK_OUT, INTERVAL, VALIDITY);
    }

    function testSetupSucceeded() {
        address quoteAsset = pricefeed.getQuoteAsset();
        uint returnedInterval = pricefeed.getInterval();
        uint returnedValidity = pricefeed.getValidity();
        var ( , , , , quoteAssetIsRegistered, , , , , , ) = pricefeed.information(quoteAsset);

        assertEq(quoteAsset, melonToken);
        assertEq(returnedInterval, INTERVAL);
        assertEq(returnedValidity, VALIDITY);
        assert(quoteAssetIsRegistered);
    }

    function testAssetRegistrationDoesNotError() {
        bytes32 sampleBytes = 0xd8344c361317e3736173f8da91dec3ca1de32f3cc0a895fd6363fbc20fd21985;
        address sampleAddress = 0x9aD216d7FBE6dF26F5F29810F2e45f229376372A;

        pricefeed.register(
            0x4b28c7f4bEb488989A2E01333eB67511e07dFf31,
            "Sample Token",
            "ABC",
            10,
            "SampleToken.io",
            "QmWHyrPWQnsz1wxHR219ooJDYTvxJPyZuDUPSDpdsAovm1",
            sampleBytes,
            sampleAddress,
            sampleAddress
        );
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
//        pricefeed.update(assetArray, priceArray);
//        uint returnedEtherTokenPrice = pricefeed.getPrice(etherToken);
//        uint returnedMelonTokenPrice = pricefeed.getPrice(melonToken);
//
//        assertEq(returnedEtherTokenPrice, inputEtherTokenPrice);
//        assertEq(returnedMelonTokenPrice, inputMelonTokenPrice);
//    }
}

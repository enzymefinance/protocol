pragma solidity ^0.4.21;

import "../../pricefeeds/SimplePriceFeedInterface.sol";

contract MockPriceFeed is SimplePriceFeedInterface {
    mapping(address => uint) addresses;
    address quote;

    function update(address[] ofAssets, uint[] newPrices) external {
        for(uint i = 0; i < ofAssets.length; ++i) {
            addresses[ofAssets[i]] = newPrices[i];
        }
    }

    function setQuoteAsset(address _ofQuote) {
        quote = _ofQuote;
    }

    function getQuoteAsset() view returns (address) {
        return quote;
    }
    
    function getLastUpdateId() view returns (uint) {
        return 1;
    }

    function getPrice(address ofAsset) view returns (uint price, uint timestamp) {
        return (addresses[ofAsset], 1);
    }

    function getPrices(address[] ofAssets) view returns (uint[] prices, uint[] timestamps) {
        prices = new uint[](ofAssets.length);
        timestamps = new uint[](ofAssets.length);

        for(uint i = 0; i < ofAssets.length; ++i) {
            var (price, timestamp) = getPrice(ofAssets[i]);

            prices[i] = price;
            timestamps[i] = timestamp;
        }

        return (prices, timestamps);
    }
}

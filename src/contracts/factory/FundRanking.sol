pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "FundFactory.sol";
import "Accounting.sol";

contract FundRanking {
    function getFundDetails(address _factory)
        view
        returns(address[], address[], uint[], uint[], string[])
    {
        FundFactory factory = FundFactory(_factory);
        uint numberOfFunds = factory.getLastFundId() + 1;
        address[] memory hubs = new address[](numberOfFunds);
        address[] memory quoteAssets = new address[](numberOfFunds);
        uint[] memory sharePrices = new uint[](numberOfFunds);
        uint[] memory creationTimes = new uint[](numberOfFunds);
        string[] memory names = new string[](numberOfFunds);

        for (uint i = 0; i < numberOfFunds; i++) {
            address hubAddress = factory.funds(i);
            Hub hub = Hub(hubAddress);
            Account accounting = Accounting(hub.accounting());
            hubs[i] = hubAddress;
            sharePrices[i] = accounting.calcSharePrice();
            quoteAssets[i] = accounting.QUOTE_ASSET();
            creationTimes[i] = hub.creationTime();
            names[i] = hub.name();
        }
        return (hubs, sharePrices, creationTimes, names);
    }
}

pragma solidity ^0.4.25;
pragma experimental ABIEncoderV2;

import "FundFactory.sol";
import "Accounting.sol";

contract FundRanking {
    function getFundDetails(address _factory)
        external
        view
        returns(address[], uint[], uint[], string[], address[])
    {
        FundFactory factory = FundFactory(_factory);
        uint numberOfFunds = factory.getLastFundId() + 1;
        address[] memory hubs = new address[](numberOfFunds);
        uint[] memory sharePrices = new uint[](numberOfFunds);
        uint[] memory creationTimes = new uint[](numberOfFunds);
        string[] memory names = new string[](numberOfFunds);
        address[] memory denominationAssets = new address[](numberOfFunds);

        for (uint i = 0; i < numberOfFunds; i++) {
            address hubAddress = factory.funds(i);
            Hub hub = Hub(hubAddress);
            hubs[i] = hubAddress;
            sharePrices[i] = Accounting(hub.accounting()).calcSharePrice();
            denominationAssets[i] = Accounting(hub.accounting()).DENOMINATION_ASSET();
            creationTimes[i] = hub.creationTime();
            names[i] = hub.name();
        }
        return (hubs, sharePrices, creationTimes, names, denominationAssets);
    }
}

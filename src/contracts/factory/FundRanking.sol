pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "./FundFactory.sol";
import "../fund/accounting/Accounting.sol";

contract FundRanking {
    function getFundDetails(address _factory)
        view
        returns(address[], uint[], uint[], string[])
    {
        FundFactory factory = FundFactory(_factory);
        uint numberOfFunds = factory.getLastFundId() + 1;
        address[] memory hubs = new address[](numberOfFunds);
        uint[] memory sharePrices = new uint[](numberOfFunds);
        uint[] memory creationTimes = new uint[](numberOfFunds);
        string[] memory names = new string[](numberOfFunds);

        for (uint i = 0; i < numberOfFunds; i++) {
            address hubAddress = factory.funds(i);
            Hub hub = Hub(hubAddress);
            hubs[i] = hubAddress;
            sharePrices[i] = Accounting(hub.accounting()).calcSharePrice();
            creationTimes[i] = hub.creationTime();
            names[i] = hub.name();
        }
        return (hubs, sharePrices, creationTimes, names);
    }
}

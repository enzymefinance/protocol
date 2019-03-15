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

    function getFundGavs(address _factory)
        external
        view
        returns(address[], uint[])
    {
        FundFactory factory = FundFactory(_factory);
        uint numberOfFunds = factory.getLastFundId() + 1;
        address[] memory hubs = new address[](numberOfFunds);
        uint[] memory gavs = new uint[](numberOfFunds);

        for (uint i = 0; i < numberOfFunds; i++) {
            address hubAddress = factory.funds(i);
            Hub hub = Hub(hubAddress);
            uint gav = Accounting(hub.accounting()).calcGav();

            hubs[i] = hubAddress;
            gavs[i] = gav;
        }
        return (hubs, gavs);
    }

    function getFundVersions(address _factory)
        external
        view
        returns(address[], bytes32[])
    {
        FundFactory factory = FundFactory(_factory);
        uint numberOfFunds = factory.getLastFundId() + 1;
        address[] memory hubs = new address[](numberOfFunds);
        bytes32[] memory versions = new bytes32[](numberOfFunds);

        for (uint i = 0; i < numberOfFunds; i++) {
            address hubAddress = factory.funds(i);
            Hub hub = Hub(hubAddress);

            (, bytes32 version) = Registry(hub.registry()).versionInformation(hub.version());

            hubs[i] = hubAddress;
            versions[i] = version;
        }
        return (hubs, versions);
    }
}

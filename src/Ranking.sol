pragma solidity ^0.4.11;

import "./FundInterface.sol";
import "./version/VersionInterface.sol";

// return the shareprice of every Fund, with the fund ID
contract Ranking {

    VersionInterface version;
    address VersionAddress;

    function Ranking(address ofVersion) {
      VersionAddress = ofVersion;
      version = VersionInterface(VersionAddress);
    }

    function getFundInfo() constant returns(address[] fundAddresses, uint[] fundSharePrices) {
        uint lastId = version.getLastFundId();
        for (uint i = 0; i <= lastId; i++) {
            address fundAddress = version.getFundById(i);
            FundInterface fund = FundInterface(fundAddress);
            uint sharePrice = fund.calcSharePrice();
            fundAddresses[i] = fundAddress;
            fundSharePrices[i] = sharePrice;
        }
        return (fundAddresses, fundSharePrices);
    }
}

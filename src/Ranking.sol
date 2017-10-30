pragma solidity ^0.4.11;

import "./FundInterface.sol";
import "./version/VersionInterface.sol";

// return the shareprice of every Fund, with the fund ID
contract Ranking {
    struct FundInfo = {
        string name;
        address ofFund;
        uint sharePrice;
    }

    VersionInterface version;
    FundInfo[] fundArray;

    function Ranking(address ofVersion) {
        version = VersionInterface(ofVersion);
    }

    function getFundInfo() returns(FundInfo[]) {
    uint lastId = version.getLastFundId();
    for (uint i = 0; i <= lastId; i++) {
        address fundAddress = version.getFundById(i);
        FundInterface fund = FundInterface(fundAddress);
        uint sharePrice = fund.calcSharePrice();
        string fundName = fund.getName();
            fundArray.push(FundInfo({
            fundName, fundAddress, sharePrice
        }));
    }
        return fundArray;
    }
}

pragma solidity ^0.4.17;

import "./FundInterface.sol";
import "./version/Version.sol";

/// @title Ranking Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Reading contract to enable fund ranking
contract Ranking {

    Version version;

    function Ranking(address ofVersion) {
        version = Version(ofVersion);
    }

    // TODO: This function will need to be updated if there are more than 1024 funds on the version
    /// @notice Returns an array of fund addresses and an array of share price associated
    function getFundsSharePrices() constant returns(address[1024] fundAddresses, uint[1024] fundSharePrices) {
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

pragma solidity ^0.4.21;

import "./Fund.sol";
import "./version/Version.sol";

/// @title FundRanking Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Reading contract to enable fund ranking
contract FundRanking {
    /**
    @notice Returns an array of fund addresses and associated arrays of share prices and creation times
    @dev Return value only w.r.t. specified version contract
    @return {
      "fundAddrs": "Array of addresses of Melon Funds",
      "sharePrices": "Array of uints containing share prices of above Melon Fund addresses"
      "creationTimes": "Array of uints representing the unix timestamp for creation of each Fund"
      "names": "Array of bytes32 representing the names of the addresses of Melon Funds"
    }
    */
    function getFundDetails(address ofVersion)
        view
        returns(
            address[],
            uint[],
            uint[],
            bytes32[]
        )
    {
        Version version = Version(ofVersion);
        uint nofFunds = version.getLastFundId() + 1;
        address[] memory fundAddrs = new address[](nofFunds);
        uint[] memory sharePrices = new uint[](nofFunds);
        uint[] memory creationTimes = new uint[](nofFunds);
        bytes32[] memory names = new bytes32[](nofFunds);

        for (uint i = 0; i < nofFunds; i++) {
            address fundAddress = version.getFundById(i);
            Fund fund = Fund(fundAddress);
            fundAddrs[i] = fundAddress;
            sharePrices[i] = fund.calcSharePrice();
            creationTimes[i] = fund.getCreationTime();
            names[i] = fund.getName();
        }
        return (fundAddrs, sharePrices, creationTimes, names);
    }
}

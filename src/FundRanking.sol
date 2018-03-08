pragma solidity ^0.4.19;

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
        address[] memory fundAddrs = new address[](numberOfFunds(version));
        uint[] memory sharePrices = new uint[](numberOfFunds(version));
        uint[] memory creationTimes = new uint[](numberOfFunds(version));
        bytes32[] memory names = new bytes32[](numberOfFunds(version));

        for (uint i = 0; i < numberOfFunds(version); i++) {
            address fundAddress = version.getFundById(i);
            Fund fund = Fund(fundAddress);
            uint sharePrice = fund.calcSharePrice();
            uint creationTime = fund.getCreationTime();
            bytes32 name = fund.getName();
            fundAddrs[i] = fundAddress;
            sharePrices[i] = sharePrice;
            creationTimes[i] = creationTime;
            names[i] = name;
        }
        return (fundAddrs, sharePrices, creationTimes, names);
    }

    // PUBLIC VIEW METHODS
    function numberOfFunds(Version version) view returns (uint);
}

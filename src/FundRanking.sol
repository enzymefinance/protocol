pragma solidity ^0.4.19;

import "./Fund.sol";
import "./version/Version.sol";


/// @title FundRanking Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Reading contract to enable fund ranking
contract FundRanking {

    Version public version;

    /// @dev Instantiate according to a specific Melon protocol version
    /// @param ofVersion Address of Melon protocol version contract
    function FundRanking(address ofVersion)  public {
        version = Version(ofVersion);
    }

    /**
    @notice Returns an array of fund addresses and associated arrays of share prices,creation times and name
    @dev Return value only w.r.t. specified version contract
    @return {
      "fundAddrs": "Array of addresses of Melon Funds",
      "sharePrices": "Array of uints containing share prices of above Melon Fund addresses"
      "creationTimes": "Array of uints representing the unix timestamp for creation of each Fund"
      "names": "Array of bytes32 representing the names of the addresses of Melon Funds"
    }
    */
    function getFundDetails()
        public view
        returns(
            address[],
            uint[],
            uint[],
            bytes32[]
        )
    {
        uint nofFunds = version.getLastFundId() + 1;
        address[] memory fundAddrs = new address[](nofFunds);
        uint[] memory sharePrices = new uint[](nofFunds);
        uint[] memory creationTimes = new uint[](nofFunds);
        bytes32[] memory names = new bytes32[](nofFunds);

        for (uint i = 0; i < nofFunds; i++) {
            address fundAddress = version.getFundById(i);
            Fund fund = Fund(fundAddress);
            uint sharePrice = fund.calcSharePrice();
            uint creationTime = fund.getCreationTime();
            bytes32 name = fund.getNameinBytes32();
            fundAddrs[i] = fundAddress;
            sharePrices[i] = sharePrice;
            creationTimes[i] = creationTime;
            names[i] = name;
        }
        return (fundAddrs, sharePrices, creationTimes, names);
    }
}

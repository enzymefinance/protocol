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
    function FundRanking(address ofVersion) {
        version = Version(ofVersion);
    }

    /**
    @notice Returns an array of fund addresses and an associated array of share prices
    @dev Return value only w.r.t. specified version contract
    @return {
      "fundAddrs": "Array of addresses of Melon Funds",
      "sharePrices": "Array of uints containing share prices of above Melon Fund addresses"
      "creationTimes": "Array of uints representing the unix timestamp for creation of each Fund"
    }
    */
    function getAddressAndSharePriceOfFunds()
        constant
        returns(
            address[] fundAddrs,
            uint[] sharePrices,
            uint[] creationTimes
        )
    {
        uint lastId = version.getLastFundId();
        for (uint i = 0; i <= lastId; i++) {
            address fundAddress = version.getFundById(i);
            Fund fund = Fund(fundAddress);
            uint sharePrice = fund.calcSharePrice();
            uint creationTime = fund.getCreationTime();
            fundAddrs[i] = fundAddress;
            sharePrices[i] = sharePrice;
            creationTimes[i] = creationTime;
        }
        return (fundAddrs, sharePrices, creationTimes);
    }
}

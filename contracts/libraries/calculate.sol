pragma solidity ^0.4.11;

import './safeMath.sol';
import '../dependencies/ERC20.sol';
import '../datafeeds/DataFeedInterface.sol';

// Fully functional calculation library
library calculate {
    using safeMath for uint256;

    // CONSTANT METHODS - ACCOUNTING

    /// Pre: baseUnitsPerShare not zero
    /// Post: priceInRef denominated in [base unit of melonAsset]
    function priceForNumBaseShares(
        uint256 numBaseShares,
        uint256 baseUnitsPerShare,
        uint256 value,
        uint256 totalSupply
    )
        constant
        returns (uint256 sharePrice)
    {
        if (totalSupply > 0)
            sharePrice = value.mul(baseUnitsPerShare).div(totalSupply);
        else
            sharePrice = baseUnitsPerShare;
        return numBaseShares.mul(sharePrice).div(baseUnitsPerShare);
    }

    /// Pre: Gross asset value and sum of all applicable and unclaimed fees has been calculated
    /// Post: Net asset value denominated in [base unit of melonAsset]
    function netAssetValue(
        uint256 gav,
        uint256 rewardsUnclaimed
    )
        constant
        returns (uint256)
    {
        return gav.sub(rewardsUnclaimed);
    }

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in [base unit of referenceAsset]
    function grossAssetValue(DataFeedInterface DataFeed) constant returns (uint256 gav) {
        for (uint256 i = 0; i < DataFeed.numRegisteredAssets(); ++i) {
            address ofAsset = address(DataFeed.getRegisteredAssetAt(i));
            uint256 assetHoldings = ERC20(ofAsset).balanceOf(this); // Amount of asset base units this vault holds
            uint256 assetPrice = DataFeed.getPrice(ofAsset);
            uint256 assetDecimals = DataFeed.getDecimals(ofAsset);
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint(assetDecimals))); // Sum up product of asset holdings of this vault and asset prices
        }
    }
}

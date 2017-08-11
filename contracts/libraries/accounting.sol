pragma solidity ^0.4.11;

import '../assets/AssetInterface.sol';
import '../assets/AssetRegistrar.sol';
import '../datafeeds/PriceFeedInterface.sol';
import './calculations.sol';
import './safeMath.sol';

// Non functional accounting library
library accounting {
    using safeMath for uint256;

    // CONSTANT METHODS - ACCOUNTING

    /// Pre:  baseUnitsPerShare not zero
    /// Post: priceInRef denominated in [base unit of melonAsset]
    function priceForNumBaseShares(
        uint256 numBaseShares,
        uint256 baseUnitsPerShare,
        uint256 value,
        uint256 totalSupply
    )
        constant
        returns (uint256)
    {
        uint256 sharePrice;
        if(totalSupply > 0)
            sharePrice = value.mul(baseUnitsPerShare).div(totalSupply);
        else
            sharePrice = baseUnitsPerShare;
        return numBaseShares.mul(sharePrice).div(baseUnitsPerShare);
    }


    // TODO: integrate this further (e.g. is it only called in one place?)
    function fetchPrices(address ofAssetRegistrar, address ofPriceFeed, uint256 assetId) returns (uint256, uint256, uint256)
    {
        // Holdings
        address ofAsset = address(PriceFeedInterface(ofPriceFeed).getDeliverableAssetAt(assetId));
        AssetInterface Asset = AssetInterface(ofAsset);
        uint256 holding = Asset.balanceOf(this); // Amount of asset base units this vault holds
        uint256 decimal = Asset.getDecimals(); // TODO use Registrar lookup call
        // Price
        uint256 price = price = PriceFeedInterface(ofPriceFeed).getPrice(ofAsset); // Asset price given quoted to MELON_ASSET (and 'quoteAsset') price
        /*LOGGER.logPortfolioContent(holding, price, decimal);*/
        return (holding, price, decimal);
    }

    /// Pre: None
    /// Post: Gav, managementReward, performanceReward, unclaimedRewards, nav, sharePrice denominated in [base unit of MELON_ASSET]
    function recalculationsAll(address ofPriceFeed)
        constant
        returns (uint gav, uint management, uint performance, uint unclaimed, uint nav, uint sharePrice)
    {
        /* Rem 1:
         *  All prices are relative to the MELON_ASSET price. The MELON_ASSET must be
         *  equal to quoteAsset of corresponding PriceFeed.
         * Rem 2:
         *  For this version, the MELON_ASSET is set as EtherToken.
         *  The price of the EtherToken relative to Ether is defined to always be equal to one.
         * Rem 3:
         *  price input unit: [Wei / ( Asset * 10**decimals )] == Base unit amount of MELON_ASSET per base unit of asset
         *  vaultHoldings input unit: [Asset * 10**decimals] == Base unit amount of asset this vault holds
         *    ==> vaultHoldings * price == value of asset holdings of this vault relative to MELON_ASSET price.
         *  where 0 <= decimals <= 18 and decimals is a natural number.
         */
        /*uint256 numDeliverableAssets = PriceFeedInterface(ofPriceFeed).numDeliverableAssets();
        for (uint256 id = 0; id < numDeliverableAssets; id++) { //sum(holdings * prices /decimals)
          var (holding, price, decimal) = fetchPrices(id); //sync with pricefeed
          gav = gav.add(holding.mul(price).div(10 ** uint(decimal)));
        }
        gav = 0;
        (
            management,
            performance,
            unclaimed
        ) = calculations.rewards(
            atLastPayout.timestamp,
            now,
            MANAGEMENT_REWARD_RATE,
            PERFORMANCE_REWARD_RATE,
            gav,
            atLastPayout.sharePrice,
            totalSupply,
            BASE_UNITS,
            DIVISOR_FEE
        );
        nav = calculations.netAssetValue(gav, unclaimed);
        sharePrice = calculations.priceForNumBaseShares(BASE_UNITS, nav, BASE_UNITS, totalSupply);*/
    }
}

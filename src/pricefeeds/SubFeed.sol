pragma solidity ^0.4.19;

import "./CanonicalRegistrar.sol";
import "./PriceFeedInterface.sol";
import "ds-value/value.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Updates and exposes price information for consuming contracts
contract SubFeed is PriceFeedInterface, DSValue {

    // FIELDS

    struct Data {
        uint price;
        uint timestamp;
    }

    mapping(address => Data) public assetData;

    // Constructor fields
    address public QUOTE_ASSET; // Asset of a portfolio against which all other assets are priced
    /// Note: Interval is purely self imposed and for information purposes only
    uint public INTERVAL; // Frequency of updates in seconds
    uint public VALIDITY; // Time in seconds for which data is considered recent
    uint updateId;        // Update counter for this pricefeed; used as a check during investment

    // METHODS

    // CONSTRUCTOR

    /// @param ofQuoteAsset Address of quote asset
    /// @param ofRegistrar Address of canonical registrar
    /// @param interval Number of seconds between pricefeed updates (this interval is not enforced on-chain, but should be followed by the datafeed maintainer)
    /// @param validity Number of seconds that datafeed update information is valid for
    function SubFeed(
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        address ofRegistrar,
        uint interval,
        uint validity
    ) {
        require(CanonicalRegistrar(ofRegistrar).isRegistered(ofQuoteAsset));
        QUOTE_ASSET = ofQuoteAsset;
        INTERVAL = interval;
        VALIDITY = validity;
    }

    // PUBLIC METHODS

    /// @dev Only Owner; Same sized input arrays
    /// @dev Updates price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == MLN (base units), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 MLN, hence price 0.080456789 MLN / EUR-T
     *  and let EUR-T decimals == 8.
     *  Input would be: information[EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    /// @param ofAssets list of asset addresses
    /// @param newPrices list of prices for each of the assets
    function update(address[] ofAssets, uint[] newPrices)
        auth
        pre_cond(ofAssets.length == newPrices.length)
    {
        updateId += 1;
        for (uint i = 0; i < ofAssets.length; ++i) {
            require(registrar.isRegistered([ofAssets[i]]));
            require(assetData[ofAssets[i]].timestamp != now); // prevent two updates in one block
            assetData[ofAssets[i]].timestamp = now;
            assetData[ofAssets[i]].price = newPrices[i];
        }
        PriceUpdated(now);
    }

    // PUBLIC VIEW METHODS

    // Get pricefeed specific information
    function getQuoteAsset() view returns (address) { return QUOTE_ASSET; }
    function getInterval() view returns (uint) { return INTERVAL; }
    function getValidity() view returns (uint) { return VALIDITY; }
    function getLastUpdateId() view returns (uint) { return updateId; }

    /// @notice Whether price of asset has been updated less than VALIDITY seconds ago
    /// @param ofAsset Existend asset in AssetRegistrar
    /// @return isRecent Price information ofAsset is recent
    function hasRecentPrice(address ofAsset)
        view
        pre_cond(registrar.isRegistered(ofAsset))
        returns (bool isRecent)
    {
        return sub(now, assetData[ofAsset].timestamp) <= VALIDITY;
    }

    /// @notice Whether prices of assets have been updated less than VALIDITY seconds ago
    /// @param ofAssets All asstes existend in AssetRegistrar
    /// @return areRecent Price information for all queried assets is valid
    function hasRecentPrices(address[] ofAssets)
        view
        returns (bool areRecent)
    {
        for (uint i; i < ofAssets.length; i++) {
            if (!hasRecentPrice(ofAssets[i])) {
                return false;
            }
        }
        return true;
    }

    /**
    @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    @dev Asset has been registered
    @param ofAsset Asset for which price should be returned
    @return {
      "price": "Price formatting: mul(exchangePrice, 10 ** decimal), to avoid floating numbers",
      "timestamp": "When the asset's price was updated"
    }
    */
    function getPrice(address ofAsset)
        view
        returns (uint price, uint timestamp)
    {
        return assetData(ofAsset);
    }

    /**
    @notice Price of a registered asset in format (bool areRecent, uint[] prices, uint[] decimals)
    @dev Convention for price formatting: mul(price, 10 ** decimal), to avoid floating numbers
    @param ofAssets Assets for which prices should be returned
    @return {
        "prices":       "Array of prices",
        "timestamps":   "Array of timestamps",
    }
    */
    function getPrices(address[] ofAssets)
        view
        returns (uint[] prices, uint[] timestamps)
    {
        for (uint i; i < ofAssets.length; i++) {
            var (price, timestamp) = getPrice(ofAssets[i]);
            prices[i] = price;
            timestamps[i] = timestamp;
        }
    }
}

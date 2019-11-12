pragma solidity ^0.4.25;

import "./PriceSource.i.sol";
import "./UpdatableFeed.i.sol";
import "./CanonicalPriceFeed.sol";
import "../dependencies/thing.sol";
import "../version/Registry.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Updates and exposes price information for consuming contracts
contract SimplePriceFeed is UpdatableFeedInterface, DSThing {

    // TYPES
    struct Data {
        uint price;
        uint timestamp;
    }

    // FIELDS
    mapping(address => Data) public assetsToPrices;

    // Constructor fields
    address public QUOTE_ASSET; // Asset of a portfolio against which all other assets are priced

    // Contract-level variables
    uint public updateId;        // Update counter for this pricefeed; used as a check during investment
    Registry public registry;
    CanonicalPriceFeed public superFeed;

    // METHODS

    // CONSTRUCTOR

    /// @param ofQuoteAsset Address of quote asset
    /// @param ofRegistrar Address of canonical registrar
    /// @param ofSuperFeed Address of superfeed
    constructor(
        address ofRegistrar,
        address ofQuoteAsset,
        address ofSuperFeed
    ) public {
        registry = Registry(ofRegistrar);
        QUOTE_ASSET = ofQuoteAsset;
        superFeed = CanonicalPriceFeed(ofSuperFeed);
    }

    // EXTERNAL METHODS

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
        external
        auth
    {
        _updatePrices(ofAssets, newPrices);
    }

    // PUBLIC VIEW METHODS

    // Get pricefeed specific information
    function getQuoteAsset() public view returns (address) { return QUOTE_ASSET; }
    function getLastUpdateId() public view returns (uint) { return updateId; }

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
        public
        view
        returns (uint price, uint timestamp)
    {
        Data data = assetsToPrices[ofAsset];
        return (data.price, data.timestamp);
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
        public
        view
        returns (uint[], uint[])
    {
        uint[] memory prices = new uint[](ofAssets.length);
        uint[] memory timestamps = new uint[](ofAssets.length);
        for (uint i; i < ofAssets.length; i++) {
            uint price;
            uint timestamp;
            (price, timestamp) = getPrice(ofAssets[i]);
            prices[i] = price;
            timestamps[i] = timestamp;
        }
        return (prices, timestamps);
    }

    // INTERNAL METHODS

    /// @dev Internal so that feeds inheriting this one are not obligated to have an exposed update(...) method, but can still perform updates
    function _updatePrices(address[] ofAssets, uint[] newPrices) internal {
        require(
            ofAssets.length == newPrices.length,
            "Arrays must be same length"
        );
        updateId++;
        for (uint i = 0; i < ofAssets.length; ++i) {
            require(
                registry.assetIsRegistered(ofAssets[i]),
                "Asset is not registered"
            );
            require(
                assetsToPrices[ofAssets[i]].timestamp != now,
                "Cannot update twice in one block"
            );
            assetsToPrices[ofAssets[i]].timestamp = now;
            assetsToPrices[ofAssets[i]].price = newPrices[i];
        }
        emit PriceUpdated(keccak256(ofAssets, newPrices));
    }
}

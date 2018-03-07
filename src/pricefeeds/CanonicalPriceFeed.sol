pragma solidity ^0.4.19;

import "./CanonicalRegistrar.sol";
import "./PriceFeedInterface.sol";
import "./SimplePriceFeed.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
contract CanonicalPriceFeed is SimplePriceFeed, CanonicalRegistrar {

    // FIELDS

    mapping(address => bool) public isWhitelisted;
    address[] public whitelist;
    uint public VALIDITY;
    uint public INTERVAL;
    uint public minimumPriceCount = 1;

    // METHODS

    // CONSTRUCTOR

    /// @dev Define and register a quote asset against which all prices are measured/based against
    /// @param ofQuoteAsset Address of quote asset
    /// @param quoteAssetName Name of quote asset
    /// @param quoteAssetSymbol Symbol for quote asset
    /// @param quoteAssetDecimals Decimal places for quote asset
    /// @param quoteAssetUrl URL related to quote asset
    /// @param quoteAssetIpfsHash IPFS hash associated with quote asset
    /// @param quoteAssetChainId Chain ID associated with quote asset (e.g. "1" for main Ethereum network)
    /// @param quoteAssetBreakIn Break-in address for the quote asset
    /// @param quoteAssetBreakOut Break-out address for the quote asset
    /// @param interval Number of seconds between pricefeed updates (this interval is not enforced on-chain, but should be followed by the datafeed maintainer)
    /// @param validity Number of seconds that datafeed update information is valid for
    function CanonicalPriceFeed(
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        bytes32 quoteAssetName,
        bytes8 quoteAssetSymbol,
        uint quoteAssetDecimals,
        string quoteAssetUrl,
        string quoteAssetIpfsHash,
        bytes32 quoteAssetChainId,
        address quoteAssetBreakIn,
        address quoteAssetBreakOut,
        uint interval,
        uint validity,
        address ofGovernance
    ) SimplePriceFeed(this, ofQuoteAsset) {
        register(
            QUOTE_ASSET,
            quoteAssetName,
            quoteAssetSymbol,
            quoteAssetDecimals,
            quoteAssetUrl,
            quoteAssetIpfsHash,
            quoteAssetChainId,
            quoteAssetBreakIn,
            quoteAssetBreakOut
        );
        INTERVAL = interval;
        VALIDITY = validity;
        setOwner(ofGovernance);
    }

    // PUBLIC METHODS

    // WHITELISTING

    function addFeedToWhitelist(address ofFeed)
        external
        auth
    {
        require(!isWhitelisted[ofFeed]);
        isWhitelisted[ofFeed] = true;
        whitelist.push(ofFeed);
    }

    // TODO: check gas usage (what is the max size of whitelist?); maybe can just run update() with array of feeds as argument instead?
    /// @param ofFeed Address of the SimplePriceFeed to be removed
    /// @param feedIndex Array index of the feed (get this using getFeedWhitelistIndex(ofFeed))
    function removeFeedFromWhitelist(address ofFeed, uint feedIndex)
        external
        auth
    {
        require(isWhitelisted[ofFeed]);
        require(whitelist[feedIndex] == ofFeed);
        delete isWhitelisted[ofFeed];
        delete whitelist[feedIndex];
        for (uint i = feedIndex; i < whitelist.length-1; i++) { // remove gap in the array
            whitelist[i] = whitelist[i+1];
        }
        whitelist.length--;
    }

    /// @dev override inherited update function to prevent manual update from authority
    function update() external { revert(); }

    // AGGREGATION

    /// @dev Only Owner; Same sized input arrays
    /// @dev Updates price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == MLN (base units), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 MLN, hence price 0.080456789 MLN / EUR-T
     *  and let EUR-T decimals == 8.
     *  Input would be: information[EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    /// @param ofAssets list of asset addresses
    function collectAndUpdate(address[] ofAssets)
        external
        auth
    {
        uint[] memory newPrices = new uint[](ofAssets.length);
        for (uint i = 0; i < ofAssets.length; i++) {
            uint[] memory assetPrices = new uint[](whitelist.length);
            for (uint j = 0; j < whitelist.length; j++) {
                SimplePriceFeed feed = SimplePriceFeed(whitelist[j]);
                var (price, timestamp) = feed.assetsToPrices(ofAssets[i]);
                if (now > add(timestamp, VALIDITY)) {
                    continue; // leaves a zero in the array (dealt with later)
                }
                assetPrices[j] = price;
            }
            newPrices[i] = medianize(assetPrices);
        }
        _updatePrices(ofAssets, newPrices);
    }

    /// @dev from MakerDao medianizer contract
    function medianize(uint[] unsorted)
        public
        view
        returns (uint)
    {
        uint count;
        uint[] memory out = new uint[](unsorted.length);
        for (uint i = 0; i < unsorted.length; i++) {
            uint item = unsorted[i];
            if (item == 0) {
                continue;   // skip zero-entries (invalid)
            } else if (i == 0 || item >= out[i - 1]) {
                out[i] = item;  // item is larger than last in array (we are home)
            } else {
                uint j = 0;
                while (item >= out[j]) {
                    j++;  // get to where element belongs (between smaller and larger items)
                }
                for (uint k = i; k > j; k--) {
                    out[k] = out[k - 1];    // bump larger elements rightward to leave slot
                }
                out[j] = item;
            }
            count++;
        }

        if (count < minimumPriceCount) {
            revert(); // TODO: maybe return false as validity or something
        }

        uint value;
        if (count % 2 == 0) {
            uint value1 = uint(out[(count / 2) - 1]);
            uint value2 = uint(out[(count / 2)]);
            value = add(value1, value2) / 2;
        } else {
            value = out[(count - 1) / 2];
        }
        return value;
    }

    function setMinimumPriceCount(uint newCount) auth { minimumPriceCount = newCount; }

    // PUBLIC VIEW METHODS

    // FEED INFORMATION

    function getQuoteAsset() view returns (address) { return QUOTE_ASSET; }
    function getInterval() view returns (uint) { return INTERVAL; }
    function getValidity() view returns (uint) { return VALIDITY; }
    function getLastUpdateId() view returns (uint) { return updateId; }

    function getFeedWhitelistIndex(address ofFeed) view returns (uint) {
        require(isWhitelisted[ofFeed]);
        for (uint i; i < whitelist.length; i++) {
            if (whitelist[i] == ofFeed) { return i; }
        }
        revert(); // not found
    }

    // PRICES

    /// @notice Whether price of asset has been updated less than VALIDITY seconds ago
    /// @param ofAsset Existend asset in AssetRegistrar
    /// @return isRecent Price information ofAsset is recent
    function hasRecentPrice(address ofAsset)
        view
        pre_cond(isRegistered(ofAsset))
        returns (bool isRecent)
    {
        var ( , timestamp) = getPrice(ofAsset);
        return (sub(now, timestamp) <= VALIDITY);
    }

    /// @notice Whether prices of assets have been updated less than VALIDITY seconds ago
    /// @param ofAssets All asstes existend in AssetRegistrar
    /// @return isRecent Price information ofAssets array is recent
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

    function getPriceInfo(address ofAsset)
        view
        returns (bool isRecent, uint price, uint assetDecimals)
    {
        isRecent = hasRecentPrice(ofAsset);
        (price, ) = getPrice(ofAsset);
        assetDecimals = getDecimals(ofAsset);
    }

    /**
    @notice Gets inverted price of an asset
    @dev Asset has been initialised and its price is non-zero
    @dev Existing price ofAssets quoted in QUOTE_ASSET (convention)
    @param ofAsset Asset for which inverted price should be return
    @return {
        "isRecent": "Whether the price is fresh, given VALIDITY interval",
        "invertedPrice": "Price based (instead of quoted) against QUOTE_ASSET",
        "assetDecimals": "Decimal places for this asset"
    }
    */
    function getInvertedPriceInfo(address ofAsset)
        view
        returns (bool isRecent, uint invertedPrice, uint assetDecimals)
    {
        uint inputPrice;
        // inputPrice quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
        (isRecent, inputPrice, assetDecimals) = getPriceInfo(ofAsset);

        // outputPrice based in QUOTE_ASSET and multiplied by 10 ** quoteDecimal
        uint quoteDecimals = getDecimals(QUOTE_ASSET);

        return (
            isRecent,
            mul(10 ** uint(quoteDecimals), 10 ** uint(assetDecimals)) / inputPrice,
            quoteDecimals   // TODO: check on this; shouldn't it be assetDecimals?
        );
    }

    /**
    @notice Gets reference price of an asset pair
    @dev One of the address is equal to quote asset
    @dev either ofBase == QUOTE_ASSET or ofQuote == QUOTE_ASSET
    @param ofBase Address of base asset
    @param ofQuote Address of quote asset
    @return {
        "isRecent": "Whether the price is fresh, given VALIDITY interval",
        "referencePrice": "Reference price",
        "decimal": "Decimal places for this asset"
    }
    */
    function getReferencePriceInfo(address ofBase, address ofQuote)
        view
        returns (bool isRecent, uint referencePrice, uint decimal)
    {
        if (getQuoteAsset() == ofQuote) {
            (isRecent, referencePrice, decimal) = getPriceInfo(ofBase);
        } else if (getQuoteAsset() == ofBase) {
            (isRecent, referencePrice, decimal) = getInvertedPriceInfo(ofQuote);
        } else {
            revert(); // no suitable reference price available
        }
    }

    /// @notice Gets price of Order
    /// @param sellAsset Address of the asset to be sold
    /// @param buyAsset Address of the asset to be bought
    /// @param sellQuantity Quantity in base units being sold of sellAsset
    /// @param buyQuantity Quantity in base units being bought of buyAsset
    /// @return orderPrice Price as determined by an order
    function getOrderPriceInfo(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        view
        returns (uint orderPrice)
    {
        return mul(buyQuantity, 10 ** uint(getDecimals(sellAsset))) / sellQuantity;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param sellAsset Asset for which check to be done if data exists
    /// @param buyAsset Asset for which check to be done if data exists
    /// @return Whether assets exist for given asset pair
    function existsPriceOnAssetPair(address sellAsset, address buyAsset)
        view
        returns (bool isExistent)
    {
        return
            hasRecentPrice(sellAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            hasRecentPrice(buyAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            (buyAsset == QUOTE_ASSET || sellAsset == QUOTE_ASSET) && // One asset must be QUOTE_ASSET
            (buyAsset != QUOTE_ASSET || sellAsset != QUOTE_ASSET); // Pair must consists of diffrent assets
    }
}

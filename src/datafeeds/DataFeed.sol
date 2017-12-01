pragma solidity ^0.4.17;

import '../dependencies/ERC20.sol';
import '../libraries/safeMath.sol';
import '../assets/AssetRegistrar.sol';
import './DataFeedInterface.sol';

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice DataFeed operator could be staked and sharePrice input validated on chain
contract DataFeed is DataFeedInterface, AssetRegistrar {
    using safeMath for uint;

    // TYPES

    struct Data  {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset quoted against `QUOTE_ASSET` * 10 ** decimals
    }

    // FIELDS

    // Constructor fields
    address public QUOTE_ASSET; // Asset of a portfolio against which all other assets are priced
    /// Note: Interval is purely self imposed and for information purposes only
    uint public INTERVAL; // Frequency of updates in seconds
    uint public VALIDITY; // Time in seconds for which data is considered valid
    // Methods fields
    mapping (uint => mapping(address => Data)) public dataHistory; // Maps integers to asset addresses, which map to data structs
    uint public nextUpdateId;
    uint public lastUpdateTimestamp;

    // PRE, POST, INVARIANT CONDITIONS

    function isDataSet(address ofAsset) internal returns (bool) { return dataHistory[getLastUpdateId()][ofAsset].timestamp > 0; }
    function isDataValid(address ofAsset) internal returns (bool) { return now - dataHistory[getLastUpdateId()][ofAsset].timestamp <= VALIDITY; }
    function isHistory(uint x) internal returns (bool) { return 0 <= x && x < nextUpdateId; }

    // CONSTANT METHODS

    // Get data feed specific information
    function getQuoteAsset() constant returns (address) { return QUOTE_ASSET; }
    function getInterval() constant returns (uint) { return INTERVAL; }
    function getValidity() constant returns (uint) { return VALIDITY; }
    function getLastUpdateId() constant pre_cond(nextUpdateId > 0) returns (uint) { return nextUpdateId - 1; }
    function getLastUpdateTimestamp() constant returns (uint) { return lastUpdateTimestamp; }

    /// @notice Gets asset specific information
    /// @dev Asset has been initialised
    /// @return valid Whether data is valid or not
    function isValid(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        returns (bool valid)
    {
        return now - dataHistory[getLastUpdateId()][ofAsset].timestamp <= VALIDITY;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param buyAsset Asset for which check to be done if data exists
    /// @param sellAsset Asset for which check to be done if data exists
    /// @return Whether assets exist for given asset pair
    function existsData(address sellAsset, address buyAsset)
        constant
        returns (bool exists)
    {
        return
            isValid(sellAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            isValid(buyAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            (buyAsset == QUOTE_ASSET || sellAsset == QUOTE_ASSET) && // One asset must be QUOTE_ASSET
            (buyAsset != QUOTE_ASSET || sellAsset != QUOTE_ASSET); // Pair must consists of diffrent assets
    }

    /// @notice Returns data feed history in an blockchain node friendly way
    /// @dev Uses an efficient bulk call
    /// @param ofAsset Asset for which data history should be returned
    /// @param withStartId Index at which history should be started, this is due to the limitation of non dynamic array size returns
    /**
    @return {
      "timestampArray": "Array of timestamps",
      "priceArray": "Array of prices"
    }
    */
    function getDataHistory(address ofAsset, uint withStartId)
        constant
        pre_cond(isHistory(withStartId))
        returns (uint[1024] timestampArray, uint[1024] priceArray)
    {
        uint indexCounter;
        uint[1024] memory timestamps;
        uint[1024] memory prices;
        while (indexCounter != 1024 || withStartId + indexCounter < nextUpdateId) {
            timestamps[withStartId + indexCounter] =
                dataHistory[withStartId + indexCounter][ofAsset].timestamp;
            prices[withStartId + indexCounter] =
                dataHistory[withStartId + indexCounter][ofAsset].price;
            ++indexCounter;
        }
        return (timestamps, prices);
    }

    /// @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    /// @dev Asset has been initialised and is active
    /// @param ofAsset Asset for which price should be return
    /// @return dataFeedPrice Price of dataFeedPrice = inputPrice * 10 ** assetDecimals(ofAsset) where inputPrice s.t. quote == QUOTE_ASSET
    function getPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint dataFeedPrice)
    {
        return dataHistory[getLastUpdateId()][ofAsset].price;
    }

    /// @notice Gets inverted price of an asset
    /// @dev Asset has been initialised and is active
    /// @param ofAsset Asset for which inverted price should be return
    /// @return invertedDataFeedPrice Inverted getPrice()
    function getInvertedPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint invertedDataFeedPrice)
    {
        return uint(10 ** uint(getDecimals(ofAsset)))
            .mul(10 ** uint(getDecimals(QUOTE_ASSET)))
            .div(getPrice(ofAsset));
    }

    /// @notice Gets reference price of an asset pair
    /// @dev One of the address is equal to quote asset
    /// @dev either ofBase == QUOTE_ASSET or ofQuote == QUOTE_ASSET
    /// @param ofBase Address of base asset
    /// @param ofQuote Address of quote asset
    /// @return dataFeedPrice
    function getReferencePrice(address ofBase, address ofQuote) constant returns (uint price) {
        if (getQuoteAsset() == ofQuote) {
            price = getPrice(ofBase);
        } else if (getQuoteAsset() == ofBase) {
            price = getInvertedPrice(ofQuote);
        } else {
            throw; // Log Error: No suitable reference price available
        }
    }

    /// @notice Gets price of Order
    /// @param ofBase Address of the Base Asset
    /// @param sellQuantity Quantity in base units being sold of sellAsset
    /// @param buyQuantity Quantity in base units being bought of buyAsset
    /// @return orderPrice Price as determined by an order
    function getOrderPrice(
        address ofBase,
        uint sellQuantity,
        uint buyQuantity
    )
        constant returns (uint orderPrice)
    {
        return buyQuantity
            .mul(10 ** uint(getDecimals(ofBase)))
            .div(sellQuantity);
    }

    /// @notice Gets timestamp and price data of an asset
    /// @dev Asset has been initialised and is active
    /// @param ofAsset Asset for which data should be returned
    /**
    @return {
      "timestamp": "Timestamp of asset",
      "price": "Price of asset"
    }
    */
    function getData(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint timestamp, uint price)
    {
        return (
            dataHistory[getLastUpdateId()][ofAsset].timestamp,
            dataHistory[getLastUpdateId()][ofAsset].price
        );
    }

    // NON-CONSTANT PUBLIC METHODS

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
    /// @param interval Number of seconds between datafeed updates (this interval is not enforced on-chain, but should be followed by the datafeed maintainer)
    /// @param validity Number of seconds that datafeed update information is valid for
    function DataFeed(
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        string quoteAssetName,
        string quoteAssetSymbol,
        uint quoteAssetDecimals,
        string quoteAssetUrl,
        string quoteAssetIpfsHash,
        bytes32 quoteAssetChainId,
        address quoteAssetBreakIn,
        address quoteAssetBreakOut,
        uint interval,
        uint validity
    ) {
        QUOTE_ASSET = ofQuoteAsset;
        INTERVAL = interval;
        VALIDITY = validity;
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
    }

    /// @dev Only Owner; Same sized input arrays
    /// @dev Updates price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == MLN (base units), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 MLN, hence price 0.080456789 MLN / EUR-T
     *  and let EUR-T decimals == 8.
     *  Input would be: dataHistory[getLastUpdateId()][EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    function update(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        pre_cond(ofAssets.length == newPrices.length)
    {
        uint thisId = nextUpdateId;
        for (uint i = 0; i < ofAssets.length; ++i) {
            if(thisId > 0)  // prevent multiple updates in one block
                require(dataHistory[thisId - 1][ofAssets[i]].timestamp != now);
            dataHistory[thisId][ofAssets[i]] = Data({
                timestamp: now,
                price: newPrices[i]
            });
        }
        lastUpdateTimestamp = now;
        DataUpdated(thisId);
        nextUpdateId++;
    }
}

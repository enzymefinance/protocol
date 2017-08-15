pragma solidity ^0.4.11;

import '../assets/AssetRegistrar.sol';
import './DataFeedInterface.sol';

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice  DataFeed operator could be staked and sharePrice input valided on chain
contract DataFeed is DataFeedInterface, AssetRegistrar {

    // TYPES

    struct Data  {
        uint256 timestamp; // Timestamp of last price update of this asset
        uint256 price; // Price of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset}
    }

    // FIELDS

    // Constant fields
    /// Note: Frequency is purely self imposed and for information purposes only
    uint constant INTERVAL = 120; // Frequency of updates in seconds
    uint constant VALIDITY = 60; // Time in seconds data is considered valid
    // Fields that are only changed in constructor
    /// Note: By definition the price of the quote asset against itself (quote asset) is always equals one
    address public QUOTE_ASSET; // Is the quote asset of a portfolio against which all other assets are priced against
    // Fields that can be changed by functions
    mapping (uint => mapping(address => Data)) public dataHistory; // Ordered data set // Address of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset} => data of asset
    uint256 public lastUpdateId;
    uint256 public lastUpdateTimestamp;

    // PRE, POST, INVARIANT CONDITIONS

    function isDataSet(address ofAsset) internal constant returns (bool) { return dataHistory[lastUpdateId][ofAsset].timestamp > 0; }
    function isDataValid(address ofAsset) internal constant returns (bool) { return now - dataHistory[lastUpdateId][ofAsset].timestamp <= VALIDITY; }
    function isEqualLength(address[] x, uint[] y) internal returns (bool) { return x.length == y.length; }
    function isHistory(uint x) constant returns (bool) { return 0 <= x && x <= lastUpdateId; }

    // CONSTANT METHODS

    // Get data feed specific information
    function getQuoteAsset() constant returns (address) { return QUOTE_ASSET; }
    function getInterval() constant returns (uint) { return INTERVAL; }
    function getValidity() constant returns (uint) { return VALIDITY; }
    function getLatestUpdateId() constant returns (uint) { return lastUpdateId; }
    function getLatestUpdateTimestamp() constant returns (uint) { return lastUpdateTimestamp; }
    function getDataHistory(address ofAsset, uint withStartId)
        constant
        pre_cond(isHistory(withStartId))
        returns (uint[1024], uint[1024])
    {
        uint256 indexCounter;
        uint[1024] memory timestamps;
        uint[1024] memory prices;
        while (indexCounter != 1024 || withStartId + indexCounter <= lastUpdateId) {
            timestamps[withStartId + indexCounter] =
                dataHistory[withStartId + indexCounter][ofAsset].timestamp;
            prices[withStartId + indexCounter] =
                dataHistory[withStartId + indexCounter][ofAsset].price;
            ++indexCounter;
        }
        return (timestamps, prices);
    }

    // Get asset specific information
    /// Pre: Asset has been initialised
    /// Post: Returns boolean if data is valid
    function isValid(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        returns (bool)
    {
        return now - dataHistory[lastUpdateId][ofAsset].timestamp <= VALIDITY;
    }

    /// Pre: Asset has been initialised and is active
    /// Post: return price
    function getPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint)
    {
        return dataHistory[lastUpdateId][ofAsset].price;
    }

    /// Pre: Asset has been initialised and is active
    /// Post: Timestamp and price of asset, where last updated not longer than `VALIDITY` seconds ago
    function getData(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint256, uint256)
    {
        return (
            dataHistory[lastUpdateId][ofAsset].timestamp,
            dataHistory[lastUpdateId][ofAsset].price
        );
    }

    // NON-CONSTANT INTERNAL METHODS

    function nextId() internal returns (uint) {
        lastUpdateId++; return lastUpdateId;
    }

    // NON-CONSTANT PUBLIC METHODS

    /// Pre: Define and register a quote asset against which all prices are measured/based against
    /// Post: Price Feed contract w Backup Owner
    function DataFeed(
        bytes32 withChainId,
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        string name,
        string symbol,
        uint256 decimal,
        string url,
        bytes32 ipfsHash,
        address breakIn,
        address breakOut
    )
        AssetRegistrar(withChainId)
    {
        QUOTE_ASSET = ofQuoteAsset;
        // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        /*register( // TODO register initial asset as quoteAsset
            ofQuoteAsset,
            name,
            symbol,
            decimal,
            url,
            ipfsHash,
            breakIn,
            breakOut
        );*/
    }

    /// Pre: Only Owner; Same sized input arrays
    /// Post: Update price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == ETH (in Wei), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 ETH
     *  and let EUR-T decimals == 8,
     *  => dataHistory[lastUpdateId][EUR-T].price = 8045678 [Wei/ (EUR-T * 10**8)]
     */
    function update(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        pre_cond(isEqualLength(ofAssets, newPrices))
    {
        uint256 prevId = lastUpdateId;
        uint256 newId = nextId();
        for (uint i = 0; i < ofAssets.length; ++i) {
            assert(dataHistory[prevId][ofAssets[i]].timestamp != now); // Intended to prevent several updates w/in one block, eg w different prices
            dataHistory[newId][ofAssets[i]] = Data({
                timestamp: now,
                price: newPrices[i]
            });
        }
        lastUpdateTimestamp = now;
        PriceUpdated(newId);
    }
}

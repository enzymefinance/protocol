pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';
import '../libraries/safeMath.sol';
import '../assets/AssetRegistrar.sol';
import './DataFeedInterface.sol';

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice  DataFeed operator could be staked and sharePrice input valided on chain
contract DataFeed is DataFeedInterface, AssetRegistrar {
    using safeMath for uint256;

    // TYPES

    struct Data  {
        uint256 timestamp; // Timestamp of last price update of this asset
        uint256 price; // Price of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset}
    }

    // FIELDS

    // Fields that are only changed in constructor
    /// Note: By definition the price of the quote asset against itself (quote asset) is always equals one
    address public QUOTE_ASSET; // Is the quote asset of a portfolio against which all other assets are priced against
    /// Note: Interval is purely self imposed and for information purposes only
    uint public INTERVAL; // Frequency of updates in seconds
    uint public VALIDITY; // Time in seconds data is considered valid
    // Fields that can be changed by functions
    mapping (uint => mapping(address => Data)) public dataHistory; // Ordered data set // Address of asset quoted against `QUOTE_ASSET` times ten to the power of {decimals of this asset} => data of asset
    uint256 public nextUpdateId;
    uint256 public lastUpdateTimestamp;

    // PRE, POST, INVARIANT CONDITIONS

    function isDataSet(address ofAsset) constant returns (bool) {
      return dataHistory[getLastUpdateId()][ofAsset].timestamp > 0;
    }
    function isDataValid(address ofAsset) internal constant returns (bool) { return now - dataHistory[getLastUpdateId()][ofAsset].timestamp <= VALIDITY; }
    function isEqualLength(address[] x, uint[] y) internal returns (bool) { return x.length == y.length; }
    function isHistory(uint x) constant returns (bool) { return 0 <= x && x < nextUpdateId; }

    // CONSTANT METHODS

    // Get data feed specific information
    function getQuoteAsset() constant returns (address) { return QUOTE_ASSET; }
    function getInterval() constant returns (uint) { return INTERVAL; }
    function getValidity() constant returns (uint) { return VALIDITY; }
    function getLastUpdateId() constant returns (uint) {
        require(nextUpdateId > 0);
        return nextUpdateId - 1;
    }
    function getLastUpdateTimestamp() constant returns (uint) {
        return lastUpdateTimestamp;
    }
    function getDataHistory(address ofAsset, uint withStartId)
        constant
        pre_cond(isHistory(withStartId))
        returns (uint[1024], uint[1024])
    {
        uint256 indexCounter;
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

    // Get asset specific information
    /// Pre: Asset has been initialised
    /// Post: Returns boolean if data is valid
    function isValid(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        returns (bool)
    {
        return now - dataHistory[getLastUpdateId()][ofAsset].timestamp <= VALIDITY;
    }

    /// Pre: Asset has been initialised and is active
    /// Post: return price
    function getPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint256)
    {
        return dataHistory[getLastUpdateId()][ofAsset].price;
    }

    /// Pre: Asset has been initialised and is active
    /// Post: Inverted price
    function getInvertedPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint)
    {
        return uint256(10 ** uint(getDecimals(ofAsset)))
            .mul(10 ** uint(getDecimals(QUOTE_ASSET)))
            .div(getPrice(ofAsset));
    }

    /// Pre: One of the address is equal to quote asset
    /// Post: Reference price of given asset pair BASE.QUOTE
    function getReferencePrice(address ofBase, address ofQuote) constant returns (uint) {
        if (getQuoteAsset() == ofQuote) {
            getPrice(ofBase);
        } else if (getQuoteAsset() == ofBase) {
            getInvertedPrice(ofBase);
        } else {
            throw; // Log Error: No suitable reference price availabe
        }
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
            dataHistory[getLastUpdateId()][ofAsset].timestamp,
            dataHistory[getLastUpdateId()][ofAsset].price
        );
    }

    // CONSTANT METHODS - ACCOUNTING

    /// Pre: Decimals in assets must be equal to decimals in PriceFeed for all entries in Universe
    /// Post: Gross asset value denominated in [base unit of referenceAsset]
    function calcGav(address ofVault) constant returns (uint256 gav) {
        for (uint256 i = 0; i < numRegisteredAssets(); ++i) {
            address ofAsset = address(getRegisteredAssetAt(i));
            uint256 assetHoldings = ERC20(ofAsset).balanceOf(ofVault); // Amount of asset base units this vault holds
            uint256 assetPrice = getPrice(ofAsset);
            uint256 assetDecimals = getDecimals(ofAsset);
            // Sum up product of asset holdings of this vault and asset prices
            gav = gav.add(assetHoldings.mul(assetPrice).div(10 ** uint(assetDecimals)));
            PortfolioContent(ofVault, assetHoldings, assetPrice, assetDecimals);
        }
    }

    // NON-CONSTANT PUBLIC METHODS

    /// Pre: Define and register a quote asset against which all prices are measured/based against
    /// Post: Price Feed contract w Backup Owner
    function DataFeed(
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        uint interval,
        uint validity
    ) {
        QUOTE_ASSET = ofQuoteAsset;
        INTERVAL = interval;
        VALIDITY = validity;
    }

    /// Pre: Only Owner; Same sized input arrays
    /// Post: Update price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == ETH (in Wei), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 ETH
     *  and let EUR-T decimals == 8,
     *  => dataHistory[getLastUpdateId()][EUR-T].price = 8045678 [Wei/ (EUR-T * 10**8)]
     */
    function update(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        pre_cond(isEqualLength(ofAssets, newPrices))
    {
        uint thisId = nextUpdateId;
        for (uint i = 0; i < ofAssets.length; ++i) {
//            assert(dataHistory[prevId][ofAssets[i]].timestamp != now); // Intended to prevent several updates w/in one block, eg w different prices
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

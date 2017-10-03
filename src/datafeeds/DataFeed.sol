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
    using safeMath for uint;

    // TYPES

    struct Data  {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset quoted against `QUOTE_ASSET` * 10 ** decimals
    }

    // FIELDS

    // Constructor fields
    address public QUOTE_ASSET; // asset of a portfolio against which all other assets are priced
    /// Note: Interval is purely self imposed and for information purposes only
    uint public INTERVAL; // Frequency of updates in seconds
    uint public VALIDITY; // Time in seconds data is considered valid
    // Methods fields
    // XXX: change to array, or make access clearer in update()
    mapping (uint => mapping(address => Data)) public dataHistory; // maps integers to asset addresses, which map to data structs
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
    function getLastUpdateId() constant
        pre_cond(nextUpdateId > 0)
        returns (uint)
    {
        return nextUpdateId - 1;
    }
    function getLastUpdateTimestamp() constant returns (uint) {
        return lastUpdateTimestamp;
    }
    /// @notice Get asset specific information
    /// @dev Pre: Asset has been initialised
    /// @dev Post Returns boolean if data is valid
    function isValid(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        returns (bool)
    {
        return now - dataHistory[getLastUpdateId()][ofAsset].timestamp <= VALIDITY;
    }
    function existsData(address sellAsset, address buyAsset)
        constant
        returns (bool)
    {
        return
            isValid(sellAsset) && // Is tradeable asset (TODO cleaner) and datafeed delivering data
            isValid(buyAsset) && // Is tradeable asset (TODO cleaner) and datafeed delivering data
            (buyAsset == QUOTE_ASSET || sellAsset == QUOTE_ASSET) && // One asset must be QUOTE_ASSET
            (buyAsset != QUOTE_ASSET || sellAsset != QUOTE_ASSET); // Pair must consists of diffrent assets
    }
    function getDataHistory(address ofAsset, uint withStartId)
        constant
        pre_cond(isHistory(withStartId))
        returns (uint[1024], uint[1024])
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

    /// @dev Asset has been initialised and is active
    /// @return Price of baseUnits(QUOTE_ASSET).ofAsset
    function getPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint)
    {
        return dataHistory[getLastUpdateId()][ofAsset].price;
    }

    /// @dev Asset has been initialised and is active
    /// @return Inverted price of baseUnits(ofAsset).QUOTE_ASSET
    function getInvertedPrice(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint)
    {
        return uint(10 ** uint(getDecimals(ofAsset)))
            .mul(10 ** uint(getDecimals(QUOTE_ASSET)))
            .div(getPrice(ofAsset));
    }

    /// @dev One of the address is equal to quote asset
    /// @dev either ofBase == QUOTE_ASSET or ofQuote == QUOTE_ASSET
    /// @return Price of baseUnits(ofBase).ofQuote
    function getReferencePrice(address ofBase, address ofQuote) constant returns (uint) {
        if (getQuoteAsset() == ofQuote) {
            getPrice(ofBase);
        } else if (getQuoteAsset() == ofBase) {
            getInvertedPrice(ofBase);
        } else {
            throw; // Log Error: No suitable reference price availabe
        }
    }

    /// @notice Price of Order
    /// @param sellQuantity Quantity in base units being sold of sellAsset
    /// @param buyQuantity Quantity in base units being bhought of buyAsset
    /// @return Price of baseUnits(QUOTE_ASSET).ofAsset
    function getOrderPrice(
        uint sellQuantity,
        uint buyQuantity
    )
        constant returns (uint)
    {
        return buyQuantity
            .mul(10 ** uint(getDecimals(QUOTE_ASSET)))
            .div(sellQuantity);
    }

    /// @dev Pre: Asset has been initialised and is active
    /// @dev Post Timestamp and price of asset, where last updated not longer than `VALIDITY` seconds ago
    function getData(address ofAsset)
        constant
        pre_cond(isDataSet(ofAsset))
        pre_cond(isDataValid(ofAsset))
        returns (uint, uint)
    {
        return (
            dataHistory[getLastUpdateId()][ofAsset].timestamp,
            dataHistory[getLastUpdateId()][ofAsset].price
        );
    }

    // NON-CONSTANT PUBLIC METHODS

    /// @dev Pre: Define and register a quote asset against which all prices are measured/based against
    /// @dev Post Price Feed contract w Backup Owner
    function DataFeed(
        address ofQuoteAsset, // Inital entry in asset registrar contract is Melon (QUOTE_ASSET)
        uint interval,
        uint validity
    ) {
        QUOTE_ASSET = ofQuoteAsset;
        INTERVAL = interval;
        VALIDITY = validity;
    }

    /// @dev Pre: Only Owner; Same sized input arrays
    /// @dev Post Update price of asset relative to QUOTE_ASSET
    /** Ex:
     *  Let QUOTE_ASSET == MLN (base units), let asset == EUR-T,
     *  let Value of 1 EUR-T := 1 EUR == 0.080456789 MLN
     *  and let EUR-T decimals == 8.
     *  Input would be: dataHistory[getLastUpdateId()][EUR-T].price = 8045678 [BaseUnits/ (EUR-T * 10**8)]
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

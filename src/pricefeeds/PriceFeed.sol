pragma solidity ^0.4.19;

import './AssetRegistrar.sol';
import './PriceFeedInterface.sol';
import 'ds-math/math.sol';

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
contract PriceFeed is PriceFeedInterface, AssetRegistrar, DSMath {
    // TYPES

    struct Data  {
        uint timestamp; // Timestamp of last price update of this asset
        uint price; // Price of asset quoted against `QUOTE_ASSET` * 10 ** decimals
    }

    // FIELDS

    // Constructor fields
    AssetRegistrar public ARC; // Asset registrar contract where asset specific information are registered
    address public QUOTE_ASSET; // Asset of a portfolio against which all other assets are priced
    /// Note: Interval is purely self imposed and for information purposes only
    uint public INTERVAL; // Frequency of updates in seconds
    uint public VALIDITY; // Time in seconds for which data is considered recent
    // Method fields
    mapping(address => Data) data;

    // CONSTANT METHODS

    // Get pricefeed specific information
    function getQuoteAsset() view returns (address ofAsset, uint decimal) {
        return (
            QUOTE_ASSET,
            ARC.getDecimal(QUOTE_ASSET)
        );
    }
    function getInterval() view returns (uint) { return INTERVAL; }
    function getValidity() view returns (uint) { return VALIDITY; }

    /// @notice Whether price of asset has been updated less than VALIDITY seconds ago
    /// @param ofAsset Existend asset in AssetRegistrar
    /// @return isRecent Price information ofAsset is recent
    function hasRecentPrice(address ofAsset)
        view
        pre_cond(ARC.isExistent(ofAsset))
        returns (bool isRecent)
    {
        return sub(now, data[ofAsset].price) <= VALIDITY;
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

    /// @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    /// @dev Asset has been registered
    /// @param ofAsset Asset for which price should be returned
    /**
    @return {
      "isRecent": "Whether the returned price is valid (as defined by VALIDITY)",
      "price": "Price formatting: mul(exchangePrice, 10 ** decimal), to avoid floating numbers",
      "decimal": "Decimal, order of magnitude of precision, of the Asset as in ERC223 token standard",
    }
    */
    function getPrice(address ofAsset)
        view
        returns (bool isRecent, uint price, uint decimal)
    {
        return (
            hasRecentPrice(ofAsset),
            data[ofAsset].price,
            ARC.getDecimal(ofAsset)
        );
    }

    /// @notice Price of a registered asset in format (bool areRecent, uint[] prices, uint[] decimals)
    /// @dev Convention for price formatting: mul(price, 10 ** decimal), to avoid floating numbers
    /// @param ofAssets Assets for which prices should be returned
    /// @return areRecent Whether the returned prices are all valid (as defined by VALIDITY)
    /// @return prices Array of prices
    function getPrices(address[] ofAssets)
        view
        returns (bool areRecent, uint[] prices, uint[] decimals)
    {
        areRecent = true;
        for (uint i; i < ofAssets.length; i++) {
            var (isRecent, price, decimal) = getPrice(ofAssets[i]);
            if (!isRecent) {
                areRecent = false;
            }
            prices[i] = price;
            decimals[i] = decimal;
        }
    }

    /// @notice Gets inverted price of an asset
    /// @dev Asset has been initialised and its price is non-zero
    /// @dev Existing price ofAssets quoted in QUOTE_ASSET (convention)
    /// @param ofAsset Asset for which inverted price should be return
    /// @return invertedPrice Price based (instead of quoted) against QUOTE_ASSET
    function getInvertedPrice(address ofAsset)
        view
        returns (bool isRecent, uint invertedPrice, uint decimal)
    {
        // inputPrice quoted in QUOTE_ASSET and multiplied by 10 ** assetDecimal
        var (isInvertedRecent, inputPrice, assetDecimal) = getPrice(ofAsset);

        // outputPrice based in QUOTE_ASSET and multiplied by 10 ** quoteDecimal
        uint quoteDecimal = ARC.getDecimal(QUOTE_ASSET);

        return (
            isInvertedRecent,
            mul(10 ** uint(quoteDecimal), 10 ** uint(assetDecimal)) / inputPrice,
            quoteDecimal
        );
    }

    /// @notice Gets reference price of an asset pair
    /// @dev One of the address is equal to quote asset
    /// @dev either ofBase == QUOTE_ASSET or ofQuote == QUOTE_ASSET
    /// @param ofBase Address of base asset
    /// @param ofQuote Address of quote asset
    /// @return referencePrice
    function getReferencePrice(address ofBase, address ofQuote)
        view
        returns (bool isRecent, uint referencePrice, uint decimal)
    {
        if (QUOTE_ASSET == ofQuote) {
            (isRecent, referencePrice, decimal) = getPrice(ofBase);
        } else if (QUOTE_ASSET == ofBase) {
            (isRecent, referencePrice, decimal) = getInvertedPrice(ofQuote);
        } else {
            revert(); // no suitable reference price available
        }
    }

    /// @notice Gets price of Order
    /// @param sellAsset Address of the Base Asset
    /// @param sellQuantity Quantity in base units being sold of sellAsset
    /// @param buyQuantity Quantity in base units being bought of buyAsset
    /// @return orderPrice Price as determined by an order
    function getOrderPrice(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        view
        returns (uint orderPrice)
    {
        return mul(buyQuantity, 10 ** uint(getDecimal(sellAsset))) / sellQuantity;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param buyAsset Asset for which check to be done if data exists
    /// @param sellAsset Asset for which check to be done if data exists
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
    /// @param interval Number of seconds between pricefeed updates (this interval is not enforced on-chain, but should be followed by the datafeed maintainer)
    /// @param validity Number of seconds that datafeed update information is valid for
    function PriceFeed(
        address ofAssetRegistrar,
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
        if (!ARC.isExistent(QUOTE_ASSET))
            ARC.register(
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
     *  Input would be: information[EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    function update(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        pre_cond(ofAssets.length == newPrices.length)
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            require(data[ofAssets[i]].timestamp != now); // prevent two updates in one block
            require(ARC.isExistent(ofAssets[i]));
            data[ofAssets[i]].timestamp = now;
            data[ofAssets[i]].price = newPrices[i];
        }
        PriceUpdated(now);
    }
}

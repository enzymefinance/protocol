pragma solidity ^0.4.17;

import '../dependencies/ERC20.sol';
import '../libraries/safeMath.sol';
import '../assets/AssetRegistrar.sol';
import './PriceFeedInterface.sol';

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
contract PriceFeed is PriceFeedInterface, AssetRegistrar {
    using safeMath for uint;

    // FIELDS

    // Constructor fields
    address public QUOTE_ASSET; // Asset of a portfolio against which all other assets are priced
    /// Note: Interval is purely self imposed and for information purposes only
    uint public INTERVAL; // Frequency of updates in seconds
    uint public VALIDITY; // Time in seconds for which data is considered recent

    // CONSTANT METHODS

    // Get pricefeed specific information
    function getQuoteAsset() constant returns (address) { return QUOTE_ASSET; }
    function getInterval() constant returns (uint) { return INTERVAL; }
    function getValidity() constant returns (uint) { return VALIDITY; }

    /// @notice Gets asset specific information
    /// @dev Asset has been initialised
    /// @return recent Whether data is recent or not
    function hasRecentPrice(address ofAsset)
        constant
        returns (bool isRecent)
    {
        return now.sub(information[ofAsset].timestamp) <= VALIDITY;
    }

    /// @notice All assets entered have a recent price defined on this pricefeed
    /// @return Whether prices for these assets are *all* recent
    function hasRecentPrices(address[] ofAssets)
        constant
        returns (bool)
    {
        for (uint i; i < ofAssets.length; i++) {
            if (!hasRecentPrice(ofAssets[i]))
                return false;
        }
        return true;
    }

    /// @notice Checks whether data exists for a given asset pair
    /// @dev Prices are only upated against QUOTE_ASSET
    /// @param buyAsset Asset for which check to be done if data exists
    /// @param sellAsset Asset for which check to be done if data exists
    /// @return Whether assets exist for given asset pair
    function existsPriceOnAssetPair(address sellAsset, address buyAsset)
        constant
        returns (bool exists)
    {
        return
            hasRecentPrice(sellAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            hasRecentPrice(buyAsset) && // Is tradable asset (TODO cleaner) and datafeed delivering data
            (buyAsset == QUOTE_ASSET || sellAsset == QUOTE_ASSET) && // One asset must be QUOTE_ASSET
            (buyAsset != QUOTE_ASSET || sellAsset != QUOTE_ASSET); // Pair must consists of diffrent assets
    }

    /// @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    /// @dev Asset has been registered and has been recently updated
    /// @param ofAsset Asset for which price should be returned
    /// @return dataFeedPrice Price of dataFeedPrice = inputPrice * 10 ** assetDecimals(ofAsset) where inputPrice s.t. quote == QUOTE_ASSET
    function getPrice(address ofAsset)
        constant
        returns (uint dataFeedPrice)
    {
        return information[ofAsset].price;
    }

    /// @notice Gets price of an assetList multiplied by ten to the power of assetDecimals
    /// @dev Assets have been registered and have been recently updated
    /// @param ofAssets Assets for which prices should be returned
    /// @return dataFeedPrices Prices of dataFeedPrice = inputPrice * 10 ** assetDecimals(ofAsset) where inputPrice s.t. quote == QUOTE_ASSET
    function getPrices(address[] ofAssets)
        constant
        returns (uint[] dataFeedPrices)
    {
        for (uint i; i < ofAssets.length; i++) {
            dataFeedPrices[i] = getPrice(ofAssets[i]);
        }
    }

    /// @notice Gets inverted price of an asset
    /// @dev Asset has been initialised and is active
    /// @param ofAsset Asset for which inverted price should be return
    /// @return invertedPriceFeedPrice Inverted getPrice()
    function getInvertedPrice(address ofAsset)
        constant
        pre_cond(hasRecentPrice(ofAsset))
        returns (uint invertedPriceFeedPrice)
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
            revert(); // Log Error: No suitable reference price available
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
     *  Input would be: information[EUR-T].price = 8045678 [MLN/ (EUR-T * 10**8)]
     */
    function update(address[] ofAssets, uint[] newPrices)
        pre_cond(isOwner())
        pre_cond(ofAssets.length == newPrices.length)
    {
        for (uint i = 0; i < ofAssets.length; ++i) {
            require(information[ofAssets[i]].timestamp != now); // prevent two updates in one block
            require(information[ofAssets[i]].exists);
            information[ofAssets[i]].timestamp = now;
            information[ofAssets[i]].price = newPrices[i];
        }
        PriceUpdated(now);
    }
}

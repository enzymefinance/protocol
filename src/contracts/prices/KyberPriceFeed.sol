pragma solidity ^0.4.21;

import "./PriceSource.i.sol";
import "../dependencies/thing.sol";
import "../exchanges/thirdparty/kyber/KyberNetworkProxy.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
/// @notice TODO: ERC20Clone inconsistency
contract KyberPriceFeed is PriceSourceInterface, DSThing {

    // FIELDS
    address public KYBER_NETWORK_PROXY;
    address public QUOTE_ASSET;
    uint public MAX_SPREAD;

    address public constant ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    uint public constant KYBER_PRECISION = 18;

    // METHODS

    // CONSTRUCTOR

    /// @dev Define and register a quote asset against which all prices are measured/based against
    function KyberPriceFeed(
        address ofKyberNetworkProxy,
        uint ofMaxSpread,
        address ofQuoteAsset,
        bytes32 quoteAssetName,
        bytes8 quoteAssetSymbol,
        uint quoteAssetDecimals,
        string quoteAssetUrl,
        string quoteAssetIpfsHash,
        address[2] quoteAssetBreakInBreakOut,
        uint[] quoteAssetStandards,
        bytes4[] quoteAssetFunctionSignatures,
        address ofGovernance
    ) {
        // TODO
        // registerAsset(
        //     ofQuoteAsset,
        //     quoteAssetName,
        //     quoteAssetSymbol,
        //     quoteAssetDecimals,
        //     quoteAssetUrl,
        //     quoteAssetIpfsHash,
        //     quoteAssetBreakInBreakOut,
        //     quoteAssetStandards,
        //     quoteAssetFunctionSignatures
        // );
        KYBER_NETWORK_PROXY = ofKyberNetworkProxy;
        MAX_SPREAD = ofMaxSpread;
        QUOTE_ASSET = ofQuoteAsset;
        setOwner(ofGovernance);
    }

    // PUBLIC VIEW METHODS

    // FEED INFORMATION

    function getQuoteAsset() view returns (address) { return QUOTE_ASSET; }

    // PRICES

    /**
    @notice Gets price of an asset multiplied by ten to the power of assetDecimals
    @dev Asset has been registered
    @param _asset Asset for which price should be returned
    @return {
      "price": "Price formatting: mul(exchangePrice, 10 ** decimal), to avoid floating numbers",
      "timestamp": "When the asset's price was updated"
    }
    */
    function getPrice(address _asset)
        view
        returns (uint price, uint timestamp)
    {
        (, price, ) =  getReferencePriceInfo(_asset, QUOTE_ASSET);
        timestamp = now;
    }

    function getPrices(address[] _assets)
        view
        returns (uint[], uint[])
    {
        uint[] memory prices = new uint[](_assets.length);
        uint[] memory timestamps = new uint[](_assets.length);
        for (uint i; i < _assets.length; i++) {
            var (price, timestamp) = getPrice(_assets[i]);
            prices[i] = price;
            timestamps[i] = timestamp;
        }
        return (prices, timestamps);
    }


    /// @notice Whether price of asset has been updated less than VALIDITY seconds ago
    /// @param ofAsset Asset in registrar
    /// @return isRecent Price information ofAsset is recent
    function hasRecentPrice(address ofAsset)
        view
        // TODO Add back: pre_cond(assetIsRegistered(ofAsset))
        returns (bool isRecent)
    {
        if (ofAsset == QUOTE_ASSET) return true;
        var (price, ) = getPrice(ofAsset);
        return price != 0;
    }

    /// @notice Whether prices of assets have been updated less than VALIDITY seconds ago
    /// @param ofAssets All assets in registrar
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
        return getReferencePriceInfo(ofAsset, QUOTE_ASSET);
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
        return getReferencePriceInfo(QUOTE_ASSET, ofAsset);
    }

    /**
    @notice Gets reference price of an asset pair
    @dev One of the address is equal to quote asset
    @dev either ofBase == QUOTE_ASSET or ofQuote == QUOTE_ASSET
    @param _baseAsset Address of base asset
    @param _quoteAsset Address of quote asset
    @return {
        "isRecent": "Whether the price is fresh, given VALIDITY interval",
        "referencePrice": "Reference price",
        "decimals": "Decimal places for this asset"
    }
    */
    function getReferencePriceInfo(address _baseAsset, address _quoteAsset)
        view
        returns (bool isRecent, uint referencePrice, uint decimals)
    {
        // TODO: decimals = getDecimals(_quoteAsset);
        decimals = ERC20Clone(_quoteAsset).decimals();
        isRecent = true;
        if (_baseAsset == QUOTE_ASSET) _baseAsset = ETH_TOKEN_ADDRESS;
        if (_quoteAsset == QUOTE_ASSET) _quoteAsset = ETH_TOKEN_ADDRESS;

        // 10 ** 10 some random value for now TODO
        var (bidRate, ) = KyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(ERC20Clone(_baseAsset), ERC20Clone(_quoteAsset), 10 ** 10);
        var (bidRateOfReversePair, ) = KyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(ERC20Clone(_quoteAsset), ERC20Clone(_baseAsset), 10 ** 10);
        uint askRate = 10 ** (KYBER_PRECISION * 2) / bidRateOfReversePair;
        
        // Check the the spread and average the price on both sides
        uint spreadFromKyber = mul(sub(askRate, bidRate), 10 ** KYBER_PRECISION) / bidRate;
        require (spreadFromKyber <= MAX_SPREAD);
        uint averagedPriceFromKyber = add(bidRate, askRate) / 2;

        referencePrice = mul(averagedPriceFromKyber, 10 ** decimals) / 10 ** KYBER_PRECISION;
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
        // TODO: decimals
        return mul(buyQuantity, 10 ** uint(ERC20Clone(sellAsset).decimals())) / sellQuantity;
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
            hasRecentPrice(buyAsset);
    }
}

pragma solidity ^0.4.21;

import "./CanonicalRegistrar.sol";
import "./SimplePriceFeed.sol";
import "../exchange/thirdparty/kyber/KyberNetworkProxy.sol";

/// @title Price Feed Template
/// @author Melonport AG <team@melonport.com>
/// @notice Routes external data to smart contracts
/// @notice Where external data includes sharePrice of Melon funds
/// @notice PriceFeed operator could be staked and sharePrice input validated on chain
/// @notice TODO: Take care of asset decimals, this doesn't handle that yet
contract KyberPriceFeed is SimplePriceFeed, CanonicalRegistrar {

    // FIELDS
    uint public VALIDITY;
    uint public INTERVAL;
    address public KYBER_NETWORK_PROXY;
    address public QUOTE_ASSET;

    address public constant ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;

    // METHODS

    // CONSTRUCTOR

    /// @dev Define and register a quote asset against which all prices are measured/based against
    function KyberPriceFeed(
        address ofKyberNetworkProxy,
        address ofQuoteAsset,
        bytes32 quoteAssetName,
        bytes8 quoteAssetSymbol,
        uint quoteAssetDecimals,
        string quoteAssetUrl,
        string quoteAssetIpfsHash,
        address[2] quoteAssetBreakInBreakOut,
        uint[] quoteAssetStandards,
        bytes4[] quoteAssetFunctionSignatures,
        uint ofInterval,
        address ofGovernance
    )        
        SimplePriceFeed(address(this), ofQuoteAsset, address(0))
    {
        registerAsset(
            ofQuoteAsset,
            quoteAssetName,
            quoteAssetSymbol,
            quoteAssetDecimals,
            quoteAssetUrl,
            quoteAssetIpfsHash,
            quoteAssetBreakInBreakOut,
            quoteAssetStandards,
            quoteAssetFunctionSignatures
        );
        KYBER_NETWORK_PROXY = ofKyberNetworkProxy;
        QUOTE_ASSET = ofQuoteAsset;
        INTERVAL = ofInterval;
        setOwner(ofGovernance);
    }

    // PUBLIC VIEW METHODS

    // FEED INFORMATION

    function getQuoteAsset() view returns (address) { return QUOTE_ASSET; }
    function getInterval() view returns (uint) { return INTERVAL; }
    function getValidity() view returns (uint) { return VALIDITY; }
    function getLastUpdateId() view returns (uint) { return updateId; }

    // PRICES

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
        ( , price, ) =  getReferencePriceInfo(ofAsset, QUOTE_ASSET);
        timestamp = now;
    }


    /// @notice Whether price of asset has been updated less than VALIDITY seconds ago
    /// @param ofAsset Asset in registrar
    /// @return isRecent Price information ofAsset is recent
    function hasRecentPrice(address ofAsset)
        view
        pre_cond(assetIsRegistered(ofAsset))
        returns (bool isRecent)
    {
        if (ofAsset == QUOTE_ASSET) return true;
        var (price,) = getPrice(ofAsset);
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
        if (_baseAsset == QUOTE_ASSET) {
            _baseAsset = ETH_TOKEN_ADDRESS;
        }
        if (_quoteAsset == QUOTE_ASSET) {
            _quoteAsset = ETH_TOKEN_ADDRESS;
        }
        isRecent = true;
        // 10 ** 10 some random value for now TODO
        (referencePrice,) = KyberNetworkProxy(KYBER_NETWORK_PROXY).getExpectedRate(ERC20(_baseAsset), ERC20(_quoteAsset), 10 ** 10);
        decimals = getDecimals(_quoteAsset);
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
            hasRecentPrice(buyAsset);
    }
}

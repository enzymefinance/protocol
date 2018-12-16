pragma solidity ^0.4.21;

/// @notice Must return a value for an asset
interface PriceSourceInterface {
    function getQuoteAsset() public view returns (address);

    /// @notice Returns false if asset not applicable, or price not recent
    function hasRecentPrice(address) public view returns (bool);

    /// @notice Return the last known price, and when it was issued
    function getPrice(address _asset) public view returns (uint price, uint timestamp);
    function getPrices(address[] _assets) public view returns (uint[] prices, uint[] timestamps);

    /// @notice Get price, and revert if not valid
    function safeGetPrice(address _asset) public view returns (uint price);
    function safeGetPrices(address[] _assets) public view returns (uint[] prices);

    /// @notice Get price with decimal and recency information
    function getPriceInfo(address _asset) view returns (bool isRecent, uint price, uint decimals);
    function getInvertedPriceInfo(address ofAsset) view returns (bool isRecent, uint price, uint decimals);


    function getReferencePriceInfo(address ofBase, address ofQuote) public view returns (bool isRecent, uint referencePrice, uint decimal);
    function getOrderPriceInfo(address sellAsset, address buyAsset, uint sellQuantity, uint buyQuantity) public view returns (uint orderPrice);
    function existsPriceOnAssetPair(address sellAsset, address buyAsset) public view returns (bool isExistent);
}

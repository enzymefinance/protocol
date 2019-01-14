pragma solidity ^0.4.21;

/// @notice Must return a value for an asset
interface PriceSourceInterface {
    event PriceUpdate(address[] token, uint[] price);

    function getQuoteAsset() public view returns (address);
    function getLastUpdate() public view returns (uint);

    /// @notice Returns false if asset not applicable, or price not recent
    function hasValidPrice(address) public view returns (bool);
    function hasValidPrices(address[]) public view returns (bool);

    /// @notice Return the last known price, and when it was issued
    function getPrice(address _asset) public view returns (uint price, uint timestamp);
    function getPrices(address[] _assets) public view returns (uint[] prices, uint[] timestamps);

    /// @notice Get price info, and revert if not valid
    function getPriceInfo(address _asset) view returns (uint price, uint decimals);
    function getInvertedPriceInfo(address ofAsset) view returns (uint price, uint decimals);

    function getReferencePriceInfo(address _base, address _quote) public view returns (uint referencePrice, uint decimal);
    function getOrderPriceInfo(address sellAsset, address buyAsset, uint sellQuantity, uint buyQuantity) public view returns (uint orderPrice);
    function existsPriceOnAssetPair(address sellAsset, address buyAsset) public view returns (bool isExistent);
    function convertQuantity(
        uint fromAssetQuantity,
        address fromAsset,
        address toAsset
    ) public view returns (uint);
}

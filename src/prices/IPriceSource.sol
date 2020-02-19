pragma solidity 0.6.1;

/// @notice Must return a value for an asset
interface IPriceSource {
    function getQuoteAsset() external view returns (address);
    function getLastUpdate() external view returns (uint);

    /// @notice Returns false if asset not applicable, or price not recent
    function hasValidPrice(address) external view returns (bool);
    function hasValidPrices(address[] calldata) external view returns (bool);

    /// @notice Return the last known price, and when it was issued
    function getPrice(address _asset) external view returns (uint price, uint timestamp);
    function getPrices(address[] calldata _assets) external view returns (uint[] memory prices, uint[] memory timestamps);

    /// @notice Get price info, and revert if not valid
    function getPriceInfo(address _asset) external view returns (uint price, uint decimals);
    function getInvertedPriceInfo(address ofAsset) external view returns (uint price, uint decimals);

    function getReferencePriceInfo(address _base, address _quote) external view returns (uint referencePrice, uint decimal);
    function getOrderPriceInfo(address sellAsset, uint sellQuantity, uint buyQuantity) external view returns (uint orderPrice);
    function existsPriceOnAssetPair(address sellAsset, address buyAsset) external view returns (bool isExistent);
    function convertQuantity(
        uint fromAssetQuantity,
        address fromAsset,
        address toAsset
    ) external view returns (uint);
}

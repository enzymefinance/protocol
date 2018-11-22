pragma solidity ^0.4.21;

/// @notice Must return a value for an asset
interface PriceSourceInterface {
    function getQuoteAsset() public view returns (address);
    function getPrice(address ofAsset) public view returns (uint price, uint timestamp);
    function getPrices(address[] ofAssets) public view returns (uint[] prices, uint[] timestamps);
}

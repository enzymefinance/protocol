pragma solidity ^0.4.21;

/// @title PriceFeed Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice PriceFeed according to the Standard Price Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as an interface on how to access the underlying PriceFeed Contract
interface SimplePriceFeedInterface {

    // EVENTS

    event PriceUpdated(bytes32 hash);

    // PUBLIC METHODS

    function update(address[] ofAssets, uint[] newPrices) external;

    // PUBLIC VIEW METHODS

    // Get price feed operation specific information
    function getQuoteAsset() view returns (address);
    function getLastUpdateId() view returns (uint);
    // Get asset specific information as updated in price feed
    function getPrice(address ofAsset) view returns (uint price, uint timestamp);
    function getPrices(address[] ofAssets) view returns (uint[] prices, uint[] timestamps);
}

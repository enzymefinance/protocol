pragma solidity 0.6.4;

interface IPriceSource {
    function convertQuantity(uint256, address, address) external view returns (uint256);
    function getOrderPriceInfo(address, uint256, uint256) external view returns (uint256);
    function getPrice(address) external view returns (uint256, uint256);
    function getPrices(address[] calldata) external view returns (uint256[] memory, uint256[] memory);
    function getReferencePriceInfo(address, address) external view returns (uint256, uint256);
    function hasValidPrice(address) external view returns (bool);
    function hasValidPrices(address[] calldata) external view returns (bool);
    function lastUpdate() external view returns (uint256);
}

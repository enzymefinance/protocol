pragma solidity 0.6.4;

interface IAccounting {
    function DEFAULT_SHARE_PRICE() external view returns (uint256);
    function DENOMINATION_ASSET() external view returns (address);
    function assetBalances(address) external view returns (uint256);
    function calcAssetGav(address) external view returns (uint256);
    function calcGav() external view returns (uint256);
    function decreaseAssetBalance(address, uint256) external;
    function getFundHoldings() external view returns (address[] memory, uint256[] memory);
    function getFundHoldingsForAsset(address) external view returns (uint256);
    function getOwnedAssetsLength() external view returns (uint256);
    function getShareCostInAsset(uint256, address) external returns (uint256);
    function increaseAssetBalance(address, uint256) external;
    function valuePerShare(uint256, uint256) external pure returns (uint256);
}

interface IAccountingFactory {
    function createInstance(address, address, address) external returns (address);
}

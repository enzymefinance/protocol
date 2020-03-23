pragma solidity 0.6.4;

interface IShares {
    function buyShares(address, address, uint256) external returns (uint256);
    function isSharesInvestmentAsset(address) external view returns (bool);
}

interface ISharesFactory {
    function createInstance(
        address,
        address[] calldata,
        address
    ) external returns (address);
}

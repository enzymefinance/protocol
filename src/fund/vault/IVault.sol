pragma solidity 0.6.4;

/// @title Vault Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IVault {
    function assetBalances(address) external view returns (uint256);
    function decreaseAssetBalance(address, uint256) external;
    function deposit(address, uint256) external;
    function getAllAssetBalances() external view returns (address[] memory, uint256[] memory);
    function getOwnedAssetsLength() external view returns (uint256);
    function increaseAssetBalance(address, uint256) external;
    function withdraw(address, uint256) external;
}

/// @title VaultFactory Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IVaultFactory {
     function createInstance(
        address,
        address[] calldata,
        address[] calldata,
        address
    ) external returns (address);
}

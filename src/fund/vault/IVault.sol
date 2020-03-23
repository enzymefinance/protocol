pragma solidity 0.6.4;

interface IVault {
    function withdraw(address, uint256) external;
}

interface IVaultFactory {
     function createInstance(
        address,
        address[] calldata,
        address[] calldata,
        address
    ) external returns (address);
}

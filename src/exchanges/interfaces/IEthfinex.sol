pragma solidity 0.6.1;
// pragma experimental ABIEncoderV2;

/// @dev Minimal interface for our interactions with EthFinex WrapperLock
interface IWrapperLock {
    function balanceOf(address) external view returns (uint256);
    function withdraw(uint256, uint8, bytes32, bytes32, uint256) external returns (bool);
    function deposit(uint256, uint256) external returns (bool);
}

/// @dev Minimal interface for our interactions with EthFinex WrapperLockEth
interface IWrapperLockEth {
    function balanceOf(address) external view returns (uint256);
    function deposit(uint256, uint256) external payable returns (bool);
}

/// @dev Minimal interface for our interactions with EthFinex WrapperRegistryEFX
interface IWrapperRegistryEFX {
    function token2WrapperLookup(address) external view returns (address);
    function wrapper2TokenLookup(address) external view returns (address);
}

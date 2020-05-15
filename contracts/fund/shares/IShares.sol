// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title Shares Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IShares {
    function burn(address, uint256) external;
    function buyShares(address, uint256, uint256) external returns (uint256);
    function DENOMINATION_ASSET() external returns (address);
    function mint(address, uint256) external;
}

/// @title SharesFactory Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface ISharesFactory {
    function createInstance(
        address,
        address,
        string calldata
    ) external returns (address);
}

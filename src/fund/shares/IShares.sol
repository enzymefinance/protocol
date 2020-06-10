// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title Shares Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IShares {
    function buyShares(address, uint256) external returns (uint256);
    function createFor(address, uint256) external; // TODO: remove when change FeeManager arch
    function getSharesCostInAsset(uint256, address) external returns (uint256);
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

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/persistent/contracts/vault/IProxiableVault.sol";

/// @title IVault Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IVault is IProxiableVault {
    enum VaultAction {
        None,
        BurnShares,
        MintShares,
        TransferShares,
        ApproveAssetSpender,
        WithdrawAssetTo,
        AddTrackedAsset,
        RemoveTrackedAsset
    }

    function addTrackedAsset(address) external;

    function approveAssetSpender(
        address,
        address,
        uint256
    ) external;

    function burnShares(address, uint256) external;

    function callOnContract(address, bytes calldata) external;

    function getAccessor() external view returns (address);

    function getOwner() external view returns (address);

    function getTrackedAssets() external view returns (address[] memory);

    function isTrackedAsset(address) external view returns (bool);

    function mintShares(address, uint256) external;

    function removeTrackedAsset(address) external;

    function transferShares(
        address,
        address,
        uint256
    ) external;

    function withdrawAssetTo(
        address,
        address,
        uint256
    ) external;
}

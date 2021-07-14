// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./VaultLibBase1.sol";

/// @title VaultLibBase2 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The first implementation of VaultLibBase1, with additional events and storage
/// @dev All subsequent implementations should inherit the previous implementation,
/// e.g., `VaultLibBase2 is VaultLibBase1`
/// DO NOT EDIT CONTRACT.
abstract contract VaultLibBase2 is VaultLibBase1 {
    event AssetManagerAdded(address manager);

    event AssetManagerRemoved(address manager);

    event ExternalPositionAdded(address indexed externalPosition);

    event ExternalPositionRemoved(address indexed externalPosition);

    event NominatedOwnerRemoved(address indexed nominatedOwner);

    event NominatedOwnerSet(address indexed nominatedOwner);

    event PersistentlyTrackedAssetAdded(address asset);

    event PersistentlyTrackedAssetRemoved(address asset);

    event ProtocolFeePaidInShares(uint256 sharesAmount);

    event ProtocolFeeSharesBoughtBack(uint256 sharesAmount, uint256 mlnValue, uint256 mlnBurned);

    event OwnershipTransferred(address indexed prevOwner, address indexed nextOwner);

    address internal nominatedOwner;
    address[] internal activeExternalPositions;
    mapping(address => bool) internal accountToIsAssetManager;
    mapping(address => bool) internal assetToIsPersistentlyTracked;
    mapping(address => bool) internal externalPositionToIsActive;
}

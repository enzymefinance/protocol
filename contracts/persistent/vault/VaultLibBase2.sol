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

    event EthReceived(address indexed sender, uint256 amount);

    event ExternalPositionAdded(address indexed externalPosition);

    event ExternalPositionRemoved(address indexed externalPosition);

    event FreelyTransferableSharesSet();

    event NameSet(string name);

    event NominatedOwnerRemoved(address indexed nominatedOwner);

    event NominatedOwnerSet(address indexed nominatedOwner);

    event ProtocolFeePaidInShares(uint256 sharesAmount);

    event ProtocolFeeSharesBoughtBack(uint256 sharesAmount, uint256 mlnValue, uint256 mlnBurned);

    event OwnershipTransferred(address indexed prevOwner, address indexed nextOwner);

    event SymbolSet(string symbol);

    // In order to make transferability guarantees to liquidity pools and other smart contracts
    // that hold/treat shares as generic ERC20 tokens, a permanent guarantee on transferability
    // is required. Once set as `true`, freelyTransferableShares should never be unset.
    bool internal freelyTransferableShares;
    address internal nominatedOwner;
    address[] internal activeExternalPositions;
    mapping(address => bool) internal accountToIsAssetManager;
    mapping(address => bool) internal externalPositionToIsActive;
}

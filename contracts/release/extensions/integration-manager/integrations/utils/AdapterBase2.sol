// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./AdapterBase.sol";

/// @title AdapterBase2 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base contract for integration adapters that extends AdapterBase
/// @dev This is a temporary contract that will be merged into AdapterBase with the next release
abstract contract AdapterBase2 is AdapterBase {
    /// @dev Provides a standard implementation for transferring incoming assets and
    /// unspent spend assets from an adapter to a VaultProxy at the end of an adapter action
    modifier postActionAssetsTransferHandler(
        address _vaultProxy,
        bytes memory _encodedAssetTransferArgs
    ) {
        _;

        (
            ,
            address[] memory spendAssets,
            ,
            address[] memory incomingAssets
        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        __transferFullAssetBalances(_vaultProxy, incomingAssets);
        __transferFullAssetBalances(_vaultProxy, spendAssets);
    }

    /// @dev Provides a standard implementation for transferring incoming assets
    /// from an adapter to a VaultProxy at the end of an adapter action
    modifier postActionIncomingAssetsTransferHandler(
        address _vaultProxy,
        bytes memory _encodedAssetTransferArgs
    ) {
        _;

        (, , , address[] memory incomingAssets) = __decodeEncodedAssetTransferArgs(
            _encodedAssetTransferArgs
        );

        __transferFullAssetBalances(_vaultProxy, incomingAssets);
    }

    /// @dev Provides a standard implementation for transferring unspent spend assets
    /// from an adapter to a VaultProxy at the end of an adapter action
    modifier postActionSpendAssetsTransferHandler(
        address _vaultProxy,
        bytes memory _encodedAssetTransferArgs
    ) {
        _;

        (, address[] memory spendAssets, , ) = __decodeEncodedAssetTransferArgs(
            _encodedAssetTransferArgs
        );

        __transferFullAssetBalances(_vaultProxy, spendAssets);
    }

    constructor(address _integrationManager) public AdapterBase(_integrationManager) {}

    /// @dev Helper to transfer full asset balances of current contract to the specified target
    function __transferFullAssetBalances(address _target, address[] memory _assets) internal {
        for (uint256 i = 0; i < _assets.length; i++) {
            uint256 balance = ERC20(_assets[i]).balanceOf(address(this));
            if (balance > 0) {
                ERC20(_assets[i]).safeTransfer(_target, balance);
            }
        }
    }
}

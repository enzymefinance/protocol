// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {AdapterBase} from "../utils/0.8.19/AdapterBase.sol";
import {ITransferAssetsAdapter} from "./interfaces/ITransferAssetsAdapter.sol";

/// @title TransferAssetsAdapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for transferring assets to any account
contract TransferAssetsAdapter is ITransferAssetsAdapter, AdapterBase {
    using SafeERC20 for IERC20;

    error TransferAssetsAdapter__ParseAssetsForAction__InvalidSelector();

    constructor(address _integrationManager) AdapterBase(_integrationManager) {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Transfers assets to a specified recipient
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function transfer(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
    {
        TransferERC20CallArgs memory callArgs = abi.decode(_actionData, (TransferERC20CallArgs));

        // Get asset amounts from asset data since max value already handled
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts,) = __decodeAssetData(_assetData);

        for (uint256 i; i < callArgs.assetAddresses.length; i++) {
            IERC20(spendAssets[i]).safeTransferFrom(_vaultProxy, callArgs.recipient, spendAssetAmounts[i]);
        }
    }

    /////////////////////////////
    // PARSE ASSETS FOR ACTION //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    function parseAssetsForAction(address _vaultProxy, bytes4 _selector, bytes calldata _actionData)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory,
            uint256[] memory
        )
    {
        if (_selector != TRANSFER_SELECTOR) {
            revert TransferAssetsAdapter__ParseAssetsForAction__InvalidSelector();
        }

        TransferERC20CallArgs memory callArgs = abi.decode(_actionData, (TransferERC20CallArgs));

        uint256 transfersLength = callArgs.assetAddresses.length;
        spendAssets_ = new address[](transfersLength);
        spendAssetAmounts_ = new uint256[](transfersLength);

        for (uint256 i; i < transfersLength; i++) {
            address assetAddress = callArgs.assetAddresses[i];
            uint256 amount = callArgs.amounts[i];

            spendAssets_[i] = assetAddress;
            spendAssetAmounts_[i] = amount == type(uint256).max ? IERC20(assetAddress).balanceOf(_vaultProxy) : amount;
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            new address[](0),
            new uint256[](0)
        );
    }
}

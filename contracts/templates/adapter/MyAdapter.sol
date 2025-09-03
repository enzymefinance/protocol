// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

// TODO: move file to `contracts/release/extensions/integration-manager/integrations/adapters/`

import {IIntegrationManager} from "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {AdapterBase} from "contracts/release/extensions/integration-manager/integrations/utils/0.8.19/AdapterBase.sol";
import {IMyAdapter} from "./IMyAdapter.sol";

/// @title MyAdapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice TODO
contract MyAdapter is IMyAdapter, AdapterBase {
    error MyAdapter__InvalidAction();

    constructor(address _integrationManager) AdapterBase(_integrationManager) {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Routes action
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Encoded Action type and action-specific data
    /// @param _assetData Encoded spend assets and incoming assets for this action
    function action(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
    {
        (IMyAdapter.Action actionId, bytes memory encodedActionArgs) = abi.decode(_actionData, (Action, bytes));

        // Route to handler helper by Action
        if (actionId == Action.Foo) {
            __foo({_vaultProxy: _vaultProxy, _actionArgs: abi.decode(encodedActionArgs, (FooActionArgs))});
        } else if (actionId == Action.Bar) {
            __bar({_vaultProxy: _vaultProxy, _actionArgs: abi.decode(encodedActionArgs, (BarActionArgs))});
        } else {
            revert MyAdapter__InvalidAction();
        }
    }

    /// @dev TODO
    function __foo(address _vaultProxy, FooActionArgs memory _actionArgs) internal {
        // TODO: Execute protocol interactions
        // TODO: Transfer incoming assets to vault
        // TODO: Transfer residual spend asset balances to vault
    }

    /// @dev TODO
    function __bar(address _vaultProxy, BarActionArgs memory _actionArgs) internal {
        // TODO: Execute protocol interactions
        // TODO: Transfer incoming assets to vault
        // TODO: Transfer residual spend asset balances to vault
    }

    /////////////////////////////
    // PARSE ASSETS FOR ACTION //
    /////////////////////////////

    /// @notice Parses info for handling assets within a given action
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _selector The function selector (deprecated: must always be ACTION_SELECTOR)
    /// @param _actionData Encoded Action type and action-specific data
    /// @return spendAssetsHandleType_ How spend assets are provisioned to this adapter (none/approval/transfer)
    /// @return spendAssets_ The assets to spend in the action
    /// @return spendAssetAmounts_ The max asset amounts to spend
    /// @return incomingAssets_ The assets to receive in the action
    /// @return minIncomingAssetAmounts_ The minimum asset amounts to receive
    function parseAssetsForAction(address _vaultProxy, bytes4 _selector, bytes calldata _actionData)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector != ACTION_SELECTOR) revert MyAdapter__InvalidAction();

        (IMyAdapter.Action actionId, bytes memory encodedActionArgs) = abi.decode(_actionData, (Action, bytes));

        // Route to parser helper by Action
        if (actionId == Action.Foo) {
            return __parseAssetsForFoo(abi.decode(encodedActionArgs, (FooActionArgs)));
        } else if (actionId == Action.Bar) {
            return __parseAssetsForBar(abi.decode(encodedActionArgs, (BarActionArgs)));
        }

        revert MyAdapter__InvalidAction();
    }

    function __parseAssetsForBar(BarActionArgs memory _actionArgs)
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        // TODO: Decode and validate spend assets and incoming assets
        // TODO: Return asset arrays and handling type
    }

    function __parseAssetsForFoo(FooActionArgs memory _actionArgs)
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        // TODO: Decode and validate spend assets and incoming assets
        // TODO: Return asset arrays and handling type
    }
}

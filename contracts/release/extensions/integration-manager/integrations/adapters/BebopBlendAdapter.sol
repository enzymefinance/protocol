// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IBebopBlend} from "contracts/external-interfaces/IBebopBlend.sol";
import {IAddressListRegistry} from "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IIntegrationManager} from "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {
    IBebopBlendAdapter
} from "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IBebopBlendAdapter.sol";
import {AdapterBase} from "contracts/release/extensions/integration-manager/integrations/utils/0.8.19/AdapterBase.sol";

/// @title BebopBlendAdapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for trading on Bebop as a taker with trusted makers only
/// @dev Only allows orders from makers who are members of a trusted list in AddressListRegistry.
/// If there is no trusted makers list specified (list id == 0), any maker is allowed.
/// Does not support partial fills or fee-on-transfer tokens.
contract BebopBlendAdapter is IBebopBlendAdapter, AdapterBase {
    error BebopBlendAdapter__InvalidAction();
    error BebopBlendAdapter__SwapSingle__InvalidReceiver();
    error BebopBlendAdapter__SwapSingle__UntrustedMaker();

    IAddressListRegistry public immutable ADDRESS_LIST_REGISTRY;
    IBebopBlend public immutable BEBOP_BLEND;
    uint256 public immutable TRUSTED_MAKERS_LIST_ID;

    constructor(
        address _integrationManager,
        address _bebopBlend,
        address _addressListRegistry,
        uint256 _trustedMakersListId
    ) AdapterBase(_integrationManager) {
        BEBOP_BLEND = IBebopBlend(_bebopBlend);
        ADDRESS_LIST_REGISTRY = IAddressListRegistry(_addressListRegistry);
        TRUSTED_MAKERS_LIST_ID = _trustedMakersListId;
    }

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Routes action
    /// @param _actionData Encoded Action type and action-specific data
    function action(address, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (Action actionId, bytes memory encodedActionArgs) = abi.decode(_actionData, (Action, bytes));

        if (actionId == Action.SwapSingle) {
            __swapSingle({_actionArgs: abi.decode(encodedActionArgs, (SwapSingleActionArgs))});
        }
    }

    /// @dev Executes a single token swap via BebopBlend
    function __swapSingle(SwapSingleActionArgs memory _actionArgs) private {
        // Approve tokens for BebopBlend
        __approveAssetMaxAsNeeded({
            _asset: _actionArgs.order.taker_token,
            _target: address(BEBOP_BLEND),
            _neededAmount: _actionArgs.order.taker_amount
        });

        // Execute swap
        BEBOP_BLEND.swapSingle({
            order: _actionArgs.order,
            makerSignature: _actionArgs.makerSignature,
            filledTakerAmount: _actionArgs.order.taker_amount
        });
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
        if (_selector != ACTION_SELECTOR) {
            revert BebopBlendAdapter__InvalidAction();
        }

        (Action actionId, bytes memory encodedActionArgs) = abi.decode(_actionData, (Action, bytes));

        if (actionId == Action.SwapSingle) {
            return __parseAssetsForSwapSingle({
                _vaultProxy: _vaultProxy, _actionArgs: abi.decode(encodedActionArgs, (SwapSingleActionArgs))
            });
        } else {
            revert BebopBlendAdapter__InvalidAction();
        }
    }

    function __parseAssetsForSwapSingle(address _vaultProxy, SwapSingleActionArgs memory _actionArgs)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        // Validate maker is trusted
        if (!isAllowedMaker(_actionArgs.order.maker_address)) {
            revert BebopBlendAdapter__SwapSingle__UntrustedMaker();
        }

        // Validate receiver is the vault
        if (_actionArgs.order.receiver != _vaultProxy) {
            revert BebopBlendAdapter__SwapSingle__InvalidReceiver();
        }

        spendAssets_ = new address[](1);
        spendAssets_[0] = _actionArgs.order.taker_token;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = _actionArgs.order.taker_amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = _actionArgs.order.maker_token;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = _actionArgs.minIncomingAssetAmount;

        spendAssetsHandleType_ = IIntegrationManager.SpendAssetsHandleType.Transfer;
    }

    //////////////////
    // MISC HELPERS //
    //////////////////

    /// @notice Checks whether an account is an allowed maker of Bebop orders
    /// @param _who The account to check
    /// @return isAllowedMaker_ True if _who is an allowed maker
    /// @dev An account is an allowed maker if:
    /// A. There is no trusted makers list
    /// B. The maker is in the trusted makers list
    function isAllowedMaker(address _who) public view returns (bool isAllowedMaker_) {
        return TRUSTED_MAKERS_LIST_ID == 0 || ADDRESS_LIST_REGISTRY.isInList(TRUSTED_MAKERS_LIST_ID, _who);
    }
}

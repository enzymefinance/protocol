// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/value-interpreter/ValueInterpreter.sol";
import "../utils/0.6.12/actions/SynthetixActionsMixin.sol";
import "../utils/0.6.12/AdapterBase.sol";

/// @title SynthetixAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with Synthetix
/// @dev This adapter currently only provides mechanisms for exiting an already-held synth position into sUSD
contract SynthetixAdapter is AdapterBase, SynthetixActionsMixin {
    address private immutable SUSD_TOKEN;
    ValueInterpreter private immutable VALUE_INTERPRETER_CONTRACT;

    constructor(
        address _integrationManager,
        address _valueInterpreter,
        address _originator,
        address _synthetixRedeemer,
        address _synthetix,
        address _susd,
        bytes32 _trackingCode
    )
        public
        AdapterBase(_integrationManager)
        SynthetixActionsMixin(_originator, _synthetixRedeemer, _synthetix, _trackingCode)
    {
        SUSD_TOKEN = _susd;
        VALUE_INTERPRETER_CONTRACT = ValueInterpreter(_valueInterpreter);
    }

    /// @notice Redeems an array of deprecated synths for their last underlying sUSD values
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function redeem(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        address[] memory synths = __decodeRedeemArgs(_actionData);

        __synthetixRedeem(synths);
    }

    // EXTERNAL FUNCTIONS

    /// @notice Trades assets on Synthetix
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function takeOrder(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (, address outgoingAsset, uint256 outgoingAssetAmount) = __decodeTakeOrderArgs(_actionData);

        __synthetixTakeOrder(_vaultProxy, outgoingAsset, outgoingAssetAmount, SUSD_TOKEN);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
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
        if (_selector == TAKE_ORDER_SELECTOR) {
            (uint256 minIncomingSusdAmount, address outgoingAsset, uint256 outgoingAssetAmount) =
                __decodeTakeOrderArgs(_actionData);

            // If synths are added back to the asset universe, they should not be traded via Synthetix,
            // since there are no longer synth settlement considerations
            require(
                !VALUE_INTERPRETER_CONTRACT.isSupportedAsset(outgoingAsset), "parseAssetsForAction: Unallowed synth"
            );

            spendAssets_ = new address[](1);
            spendAssets_[0] = outgoingAsset;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = SUSD_TOKEN;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingSusdAmount;

            return (
                IIntegrationManager.SpendAssetsHandleType.None,
                spendAssets_,
                spendAssetAmounts_,
                incomingAssets_,
                minIncomingAssetAmounts_
            );
        } else if (_selector == REDEEM_SELECTOR) {
            spendAssets_ = __decodeRedeemArgs(_actionData);
            spendAssetAmounts_ = new uint256[](spendAssets_.length);

            for (uint256 i; i < spendAssets_.length; i++) {
                spendAssetAmounts_[i] = ERC20(spendAssets_[i]).balanceOf(_vaultProxy);
            }

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = SUSD_TOKEN;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = 1;

            return (
                IIntegrationManager.SpendAssetsHandleType.Transfer,
                spendAssets_,
                spendAssetAmounts_,
                incomingAssets_,
                minIncomingAssetAmounts_
            );
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded redeem arguments
    function __decodeRedeemArgs(bytes memory _actionData) private pure returns (address[] memory synths_) {
        return abi.decode(_actionData, (address[]));
    }

    /// @dev Helper to decode the encoded takeOrder arguments
    function __decodeTakeOrderArgs(bytes memory _actionData)
        private
        pure
        returns (uint256 minIncomingSusdAmount_, address outgoingAsset_, uint256 outgoingAssetAmount_)
    {
        return abi.decode(_actionData, (uint256, address, uint256));
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IArrakisV2Vault} from "../../../../../external-interfaces/IArrakisV2Vault.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {AdapterBase} from "../utils/0.8.19/AdapterBase.sol";

/// @title ArrakisV2Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with ArrakisV2 vaults
contract ArrakisV2Adapter is AdapterBase {
    constructor(address _integrationManager) AdapterBase(_integrationManager) {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Deposit underlying into ArrakisV2 vault
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lend(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        postActionSpendAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (IArrakisV2Vault arrakisVault, uint256[2] memory maxUnderlyingAmounts, uint256 sharesAmount) =
            __decodeLendCallArgs(_actionData);

        (address[] memory spendAssets,,) = __decodeAssetData(_assetData);

        __approveAssetMaxAsNeeded({
            _asset: spendAssets[0],
            _target: address(arrakisVault),
            _neededAmount: maxUnderlyingAmounts[0]
        });

        __approveAssetMaxAsNeeded({
            _asset: spendAssets[1],
            _target: address(arrakisVault),
            _neededAmount: maxUnderlyingAmounts[1]
        });

        arrakisVault.mint({_mintAmount: sharesAmount, _receiver: _vaultProxy});
    }

    /// @notice Redeem ArrakisV2 vault shares into their underlying
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Parsed spend assets and incoming assets data for this action
    function redeem(address _vaultProxy, bytes calldata _actionData, bytes calldata) external {
        (IArrakisV2Vault arrakisVault, uint256 sharesAmount,) = __decodeRedeemCallArgs(_actionData);

        arrakisVault.burn({_burnAmount: sharesAmount, _receiver: _vaultProxy});
    }

    /////////////////////////////
    // PARSE ASSETS FOR ACTION //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address, bytes4 _selector, bytes calldata _actionData)
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
        if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
        } else {
            revert("parseAssetsForAction: _selector invalid");
        }
    }

    //////////////
    // PARSERS //
    //////////////

    /// @dev Helper to parse assets for lend() actions
    function __parseAssetsForLend(bytes calldata _actionData)
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
        (IArrakisV2Vault arrakisVault, uint256[2] memory maxUnderlyingAmounts, uint256 sharesAmount) =
            __decodeLendCallArgs(_actionData);
        spendAssets_ = new address[](2);
        spendAssets_[0] = arrakisVault.token0();
        spendAssets_[1] = arrakisVault.token1();

        spendAssetAmounts_ = new uint256[](2);
        spendAssetAmounts_[0] = maxUnderlyingAmounts[0];
        spendAssetAmounts_[1] = maxUnderlyingAmounts[1];

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = address(arrakisVault);

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = sharesAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper to parse assets for redeem() actions
    function __parseAssetsForRedeem(bytes calldata _actionData)
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
        (IArrakisV2Vault arrakisVault, uint256 sharesAmount, uint256[2] memory minIncomingUnderlyingAmounts) =
            __decodeRedeemCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = address(arrakisVault);

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = sharesAmount;

        incomingAssets_ = new address[](2);
        incomingAssets_[0] = arrakisVault.token0();
        incomingAssets_[1] = arrakisVault.token1();

        minIncomingAssetAmounts_ = new uint256[](2);
        minIncomingAssetAmounts_[0] = minIncomingUnderlyingAmounts[0];
        minIncomingAssetAmounts_[1] = minIncomingUnderlyingAmounts[1];

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    //////////////
    // DECODERS //
    //////////////

    /// @dev Helper to decode the encoded callOnIntegration call arguments for lend()
    function __decodeLendCallArgs(bytes memory _actionData)
        private
        pure
        returns (IArrakisV2Vault arrakisVault_, uint256[2] memory maxUnderlyingAmounts_, uint256 sharesAmount_)
    {
        return abi.decode(_actionData, (IArrakisV2Vault, uint256[2], uint256));
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments for redeem()
    function __decodeRedeemCallArgs(bytes memory _actionData)
        private
        pure
        returns (IArrakisV2Vault arrakisVault_, uint256 sharesAmount_, uint256[2] memory minIncomingUnderlyingAmounts_)
    {
        return abi.decode(_actionData, (IArrakisV2Vault, uint256, uint256[2]));
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC4626} from "openzeppelin-solc-0.8/token/ERC20/extensions/ERC4626.sol";
import {IIntegrationManager} from "../IIntegrationAdapter.sol";
import {AdapterBase} from "../utils/0.8.19/AdapterBase.sol";

/// @title ERC4626Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with ERC4626 vaults
contract ERC4626Adapter is AdapterBase {
    constructor(address _integrationManager) AdapterBase(_integrationManager) {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Deposit underlying into ERC4626 vault
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lend(address _vaultProxy, bytes calldata, bytes calldata _assetData) external {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts, address[] memory incomingAssets) =
            __decodeAssetData(_assetData);

        __approveAssetMaxAsNeeded({
            _asset: spendAssets[0],
            _target: incomingAssets[0],
            _neededAmount: spendAssetAmounts[0]
        });

        IERC4626(incomingAssets[0]).deposit({assets: spendAssetAmounts[0], receiver: _vaultProxy});
    }

    /// @notice Redeem ERC4626 vault shares into their underlying
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function redeem(address _vaultProxy, bytes calldata, bytes calldata _assetData) external {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts,) = __decodeAssetData(_assetData);

        IERC4626(spendAssets[0]).redeem({shares: spendAssetAmounts[0], receiver: _vaultProxy, owner: _vaultProxy});
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
            spendAssets_ = new address[](1);
            spendAssetAmounts_ = new uint256[](1);
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            (address erc4626VaultAddress, uint256 underlyingAmount, uint256 minIncomingSharesAmount) =
                __decodeLendCallArgs(_actionData);

            spendAssets_[0] = IERC4626(erc4626VaultAddress).asset();
            spendAssetAmounts_[0] = underlyingAmount;
            incomingAssets_[0] = erc4626VaultAddress;
            minIncomingAssetAmounts_[0] = minIncomingSharesAmount;

            return (
                IIntegrationManager.SpendAssetsHandleType.Transfer,
                spendAssets_,
                spendAssetAmounts_,
                incomingAssets_,
                minIncomingAssetAmounts_
            );
        } else if (_selector == REDEEM_SELECTOR) {
            spendAssets_ = new address[](1);
            spendAssetAmounts_ = new uint256[](1);
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            (address erc4626VaultAddress, uint256 sharesAmount, uint256 minIncomingUnderlyingAmount) =
                __decodeRedeemCallArgs(_actionData);

            spendAssets_[0] = erc4626VaultAddress;
            spendAssetAmounts_[0] = sharesAmount;
            incomingAssets_[0] = IERC4626(erc4626VaultAddress).asset();
            minIncomingAssetAmounts_[0] = minIncomingUnderlyingAmount;

            return (
                IIntegrationManager.SpendAssetsHandleType.Approve,
                spendAssets_,
                spendAssetAmounts_,
                incomingAssets_,
                minIncomingAssetAmounts_
            );
        } else {
            revert("parseAssetsForAction: _selector invalid");
        }
    }

    //////////////
    // DECODERS //
    //////////////

    /// @dev Helper to decode the encoded callOnIntegration call arguments for lend()
    function __decodeLendCallArgs(bytes memory _actionData)
        private
        pure
        returns (address erc4626VaultAddress_, uint256 underlyingAmount_, uint256 minIncomingSharesAmount_)
    {
        return abi.decode(_actionData, (address, uint256, uint256));
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments for redeem()
    function __decodeRedeemCallArgs(bytes memory _actionData)
        private
        pure
        returns (address erc4626VaultAddress_, uint256 sharesAmount_, uint256 minIncomingUnderlyingAmount_)
    {
        return abi.decode(_actionData, (address, uint256, uint256));
    }
}

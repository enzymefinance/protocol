// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IERC20} from "../../../../../../../external-interfaces/IERC20.sol";
import {IWETH} from "../../../../../../../external-interfaces/IWETH.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {IIntegrationManager} from "../../../../IIntegrationManager.sol";
import {AdapterBase} from "../AdapterBase.sol";

/// @title GenericWrappingAdapterBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base contract for Wrapping Adapters
abstract contract GenericWrappingAdapterBase is AdapterBase {
    using SafeERC20 for IERC20;

    IERC20 internal immutable DERIVATIVE;
    IERC20 internal immutable UNDERLYING;
    bool internal immutable USE_NATIVE_ASSET;

    /// @param _integrationManager The IntegrationManager
    /// @param _derivativeAddress The derivative (wrapped) asset
    /// @param _underlyingAddress The underlying (unwrapped) asset
    /// @param _useNativeAsset True if _underlyingAddress is the wrapped native asset (e.g., WETH),
    /// but the native asset (e.g., ETH) should be sent and received
    constructor(
        address _integrationManager,
        address _derivativeAddress,
        address _underlyingAddress,
        bool _useNativeAsset
    ) AdapterBase(_integrationManager) {
        DERIVATIVE = IERC20(_derivativeAddress);
        UNDERLYING = IERC20(_underlyingAddress);
        USE_NATIVE_ASSET = _useNativeAsset;
    }

    /// @dev Needed to unwrap the wrapped native asset (e.g., WETH)
    receive() external payable {}

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to wrap an underlying for the derivative
    function __wrap(uint256 _underlyingAmount) internal virtual {
        revert("__wrap: Not implemented");
    }

    /// @dev Logic to unwrap a derivative for the underlying
    function __unwrap(uint256 _derivativeAmount) internal virtual {
        revert("__unwrap: Not implemented");
    }

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Wraps an amount an underlying
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function wrap(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (uint256 outgoingAmount,) = __decodeCallArgs(_actionData);

        if (USE_NATIVE_ASSET) {
            IWETH(address(UNDERLYING)).withdraw(outgoingAmount);
        }

        __wrap({_underlyingAmount: outgoingAmount});

        // Transfer the derivative asset to vault
        DERIVATIVE.safeTransfer({_to: _vaultProxy, _value: DERIVATIVE.balanceOf(address(this))});
    }

    /// @notice Unwraps an amount of derivative
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unwrap(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (uint256 outgoingAmount,) = __decodeCallArgs(_actionData);

        __unwrap({_derivativeAmount: outgoingAmount});

        // Transfer underlying asset to vault
        if (USE_NATIVE_ASSET) {
            Address.sendValue(payable(_vaultProxy), address(this).balance);
        } else {
            UNDERLYING.safeTransfer({_to: _vaultProxy, _value: UNDERLYING.balanceOf(address(this))});
        }
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
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
        (uint256 outgoingAmount, uint256 minIncomingAmount) = __decodeCallArgs(_actionData);

        spendAssetsHandleType_ = IIntegrationManager.SpendAssetsHandleType.Transfer;

        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        spendAssetAmounts_[0] = outgoingAmount;
        minIncomingAssetAmounts_[0] = minIncomingAmount;

        if (_selector == WRAP_SELECTOR) {
            spendAssets_[0] = address(UNDERLYING);
            incomingAssets_[0] = address(DERIVATIVE);
        } else if (_selector == UNWRAP_SELECTOR) {
            spendAssets_[0] = address(DERIVATIVE);
            incomingAssets_[0] = address(UNDERLYING);
        } else {
            revert("parseAssetsForAction: _selector invalid");
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for wrap and unwrap
    function __decodeCallArgs(bytes memory _actionData)
        private
        pure
        returns (uint256 outgoingAmount_, uint256 minIncomingAmount_)
    {
        return abi.decode(_actionData, (uint256, uint256));
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../utils/actions/CurveExchangeActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title CurveExchangeAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for swapping assets on Curve <https://www.curve.fi/>
contract CurveExchangeAdapter is AdapterBase, CurveExchangeActionsMixin {
    constructor(address _integrationManager, address _addressProvider, address _wethToken)
        public
        AdapterBase(_integrationManager)
        CurveExchangeActionsMixin(_addressProvider, _wethToken)
    {}

    /// @dev Needed to receive ETH from swap and to unwrap WETH
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Trades assets on Curve
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function takeOrder(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (
            address pool,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            address incomingAsset,
            uint256 minIncomingAssetAmount
        ) = __decodeCallArgs(_actionData);

        __curveTakeOrder(_vaultProxy, pool, outgoingAsset, outgoingAssetAmount, incomingAsset, minIncomingAssetAmount);
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
        require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForAction: _selector invalid");
        (
            address pool,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            address incomingAsset,
            uint256 minIncomingAssetAmount
        ) = __decodeCallArgs(_actionData);

        require(pool != address(0), "parseAssetsForAction: No pool address provided");

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingAsset;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingAsset;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the take order encoded call arguments
    function __decodeCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address pool_,
            address outgoingAsset_,
            uint256 outgoingAssetAmount_,
            address incomingAsset_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_actionData, (address, address, uint256, address, uint256));
    }
}

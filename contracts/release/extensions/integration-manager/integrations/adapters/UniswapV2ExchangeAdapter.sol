// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "../utils/0.6.12/actions/UniswapV2ActionsMixin.sol";
import "../utils/0.6.12/AdapterBase.sol";

/// @title UniswapV2ExchangeAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with Uniswap v2 swaps
contract UniswapV2ExchangeAdapter is AdapterBase, UniswapV2ActionsMixin {
    constructor(address _integrationManager, address _router)
        public
        AdapterBase(_integrationManager)
        UniswapV2ActionsMixin(_router)
    {}

    /// @notice Trades assets on Uniswap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function takeOrder(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (address[] memory path,, uint256 minIncomingAssetAmount) = __decodeTakeOrderCallArgs(_actionData);

        // Uses full balance to support outgoing fee-on-transfer tokens
        __uniswapV2Swap(_vaultProxy, ERC20(path[0]).balanceOf(address(this)), minIncomingAssetAmount, path);
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

        return __parseAssetsForTakeOrder(_actionData);
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during takeOrder() calls
    function __parseAssetsForTakeOrder(bytes calldata _actionData)
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
        (address[] memory path, uint256 outgoingAssetAmount, uint256 minIncomingAssetAmount) =
            __decodeTakeOrderCallArgs(_actionData);

        require(path.length >= 2, "__parseAssetsForTakeOrder: _path must be >= 2");

        spendAssets_ = new address[](1);
        spendAssets_[0] = path[0];
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = path[path.length - 1];
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
    function __decodeTakeOrderCallArgs(bytes memory _actionData)
        private
        pure
        returns (address[] memory path_, uint256 outgoingAssetAmount_, uint256 minIncomingAssetAmount_)
    {
        return abi.decode(_actionData, (address[], uint256, uint256));
    }
}

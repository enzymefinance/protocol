// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IParaSwapV6AugustusSwapper} from "../../../../../external-interfaces/IParaSwapV6AugustusSwapper.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {AdapterBase} from "../utils/0.8.19/AdapterBase.sol";
import {IParaSwapV6Adapter} from "./interfaces/IParaSwapV6Adapter.sol";

/// @title ParaSwapV6Adapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for interacting with ParaSwap (v6)
contract ParaSwapV6Adapter is AdapterBase {
    /// @dev ParaSwapV6 Exchange Contract
    IParaSwapV6AugustusSwapper public immutable PARA_SWAP_V6_AUGUSTUS_SWAPPER;

    /// @dev Thrown if an invalid action is passed to the adapter
    error ParaSwapV6Adapter__InvalidAction();

    constructor(address _integrationManagerAddress, IParaSwapV6AugustusSwapper _augustusSwapper)
        AdapterBase(_integrationManagerAddress)
    {
        PARA_SWAP_V6_AUGUSTUS_SWAPPER = _augustusSwapper;
    }

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Execute an adapter action
    /// @param _vaultProxyAddress The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function action(address _vaultProxyAddress, bytes calldata _actionData, bytes calldata) external {
        (IParaSwapV6Adapter.Action actionId, bytes memory encodedActionArgs) =
            abi.decode(_actionData, (IParaSwapV6Adapter.Action, bytes));

        if (actionId == IParaSwapV6Adapter.Action.SwapExactAmountIn) {
            __swapExactAmountIn({
                _vaultProxyAddress: _vaultProxyAddress,
                _actionArgs: abi.decode(encodedActionArgs, (IParaSwapV6Adapter.SwapActionArgs))
            });
        } else if (actionId == IParaSwapV6Adapter.Action.SwapExactAmountOut) {
            __swapExactAmountOut({
                _vaultProxyAddress: _vaultProxyAddress,
                _actionArgs: abi.decode(encodedActionArgs, (IParaSwapV6Adapter.SwapActionArgs))
            });
        } else {
            revert ParaSwapV6Adapter__InvalidAction();
        }
    }

    /// @dev Helper to swap on ParaSwap with an exact amount in
    function __swapExactAmountIn(address _vaultProxyAddress, IParaSwapV6Adapter.SwapActionArgs memory _actionArgs)
        private
    {
        // Using balance or tokens with on-transfer fees
        uint256 srcTokenBalance = IERC20(_actionArgs.swapData.srcToken).balanceOf(address(this));

        // Grant max outgoing token allowance to ParaSwap
        __approveAssetMaxAsNeeded({
            _asset: _actionArgs.swapData.srcToken,
            _target: address(PARA_SWAP_V6_AUGUSTUS_SWAPPER),
            _neededAmount: srcTokenBalance
        });

        IParaSwapV6AugustusSwapper.GenericData memory swapData = IParaSwapV6AugustusSwapper.GenericData({
            srcToken: _actionArgs.swapData.srcToken,
            destToken: _actionArgs.swapData.destToken,
            fromAmount: srcTokenBalance, // Using balance for tokens with on-transfer fees
            toAmount: _actionArgs.swapData.toAmount,
            quotedAmount: _actionArgs.swapData.quotedAmount,
            metadata: _actionArgs.swapData.metadata,
            beneficiary: payable(_vaultProxyAddress)
        });

        // Execute the swap
        PARA_SWAP_V6_AUGUSTUS_SWAPPER.swapExactAmountIn({
            _executor: _actionArgs.executor,
            _swapData: swapData,
            _partnerAndFee: _actionArgs.partnerAndFee,
            _permit: "",
            _executorData: _actionArgs.executorData
        });
    }

    /// @dev Helper to swap on ParaSwap with an exact amount in
    function __swapExactAmountOut(address _vaultProxyAddress, IParaSwapV6Adapter.SwapActionArgs memory _actionArgs)
        private
    {
        // Grant max outgoing token allowance to ParaSwap
        __approveAssetMaxAsNeeded({
            _asset: _actionArgs.swapData.srcToken,
            _target: address(PARA_SWAP_V6_AUGUSTUS_SWAPPER),
            _neededAmount: _actionArgs.swapData.fromAmount
        });

        IParaSwapV6AugustusSwapper.GenericData memory swapData = IParaSwapV6AugustusSwapper.GenericData({
            srcToken: _actionArgs.swapData.srcToken,
            destToken: _actionArgs.swapData.destToken,
            fromAmount: _actionArgs.swapData.fromAmount,
            toAmount: _actionArgs.swapData.toAmount,
            quotedAmount: _actionArgs.swapData.quotedAmount,
            metadata: _actionArgs.swapData.metadata,
            beneficiary: payable(_vaultProxyAddress)
        });

        // Execute the swap
        PARA_SWAP_V6_AUGUSTUS_SWAPPER.swapExactAmountOut({
            _executor: _actionArgs.executor,
            _swapData: swapData,
            _partnerAndFee: _actionArgs.partnerAndFee,
            _permit: "",
            _executorData: _actionArgs.executorData
        });

        // Sweep excess outgoing token amount back to vault
        __pushFullAssetBalance({_target: _vaultProxyAddress, _asset: _actionArgs.swapData.srcToken});
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
        pure
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector != ACTION_SELECTOR) revert ParaSwapV6Adapter__InvalidAction();

        (IParaSwapV6Adapter.Action actionId, bytes memory encodedActionArgs) =
            abi.decode(_actionData, (IParaSwapV6Adapter.Action, bytes));

        if (
            actionId == IParaSwapV6Adapter.Action.SwapExactAmountIn
                || actionId == IParaSwapV6Adapter.Action.SwapExactAmountOut
        ) {
            IParaSwapV6Adapter.SwapActionArgs memory actionArgs =
                abi.decode(encodedActionArgs, (IParaSwapV6Adapter.SwapActionArgs));

            spendAssets_ = new address[](1);
            spendAssetAmounts_ = new uint256[](1);
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);

            spendAssets_[0] = actionArgs.swapData.srcToken;
            spendAssetAmounts_[0] = actionArgs.swapData.fromAmount;
            incomingAssets_[0] = actionArgs.swapData.destToken;
            minIncomingAssetAmounts_[0] = actionArgs.swapData.toAmount;
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IPendleV2PrincipalToken} from "../../../../../external-interfaces/IPendleV2PrincipalToken.sol";
import {IPendleV2Router} from "../../../../../external-interfaces/IPendleV2Router.sol";
import {IPendleV2StandardizedYield} from "../../../../../external-interfaces/IPendleV2StandardizedYield.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {AdapterBase} from "../utils/0.8.19/AdapterBase.sol";
import {IPendleV2Adapter} from "./interfaces/IPendleV2Adapter.sol";

/// @title PendleV2Adapter Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Adapter for interacting with Pendle v2
contract PendleV2Adapter is IPendleV2Adapter, AdapterBase {
    address private constant NATIVE_ASSET_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address private constant PENDLE_NATIVE_ASSET_ADDRESS = address(0);

    IPendleV2Router private immutable PENDLE_ROUTER;
    IWETH private immutable WRAPPED_NATIVE_ASSET;

    error PendleV2Adapter__InvalidAction();

    constructor(address _integrationManager, address _pendleRouterAddress, address _wrappedNativeAssetAddress)
        AdapterBase(_integrationManager)
    {
        PENDLE_ROUTER = IPendleV2Router(_pendleRouterAddress);
        WRAPPED_NATIVE_ASSET = IWETH(_wrappedNativeAssetAddress);
    }

    /// @dev Required to unwrap WRAPPED_NATIVE_ASSET when using native asset as SY deposit token
    receive() external payable {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Execute an adapter action
    /// @param _vaultProxyAddress The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function action(address _vaultProxyAddress, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (IPendleV2Adapter.Action actionId, bytes memory encodedActionArgs) = abi.decode(_actionData, (Action, bytes));

        if (actionId == Action.BuyPrincipalToken) {
            __buyPrincipalToken({
                _vaultProxyAddress: _vaultProxyAddress,
                _actionArgs: abi.decode(encodedActionArgs, (BuyPrincipalTokenActionArgs))
            });
        } else if (actionId == Action.SellPrincipalToken) {
            __sellPrincipalToken({
                _vaultProxyAddress: _vaultProxyAddress,
                _actionArgs: abi.decode(encodedActionArgs, (SellPrincipalTokenActionArgs))
            });
        } else if (actionId == Action.AddLiquidity) {
            __addLiquidity({
                _vaultProxyAddress: _vaultProxyAddress,
                _actionArgs: abi.decode(encodedActionArgs, (AddLiquidityActionArgs))
            });
        } else if (actionId == Action.RemoveLiquidity) {
            __removeLiquidity({
                _vaultProxyAddress: _vaultProxyAddress,
                _actionArgs: abi.decode(encodedActionArgs, (RemoveLiquidityActionArgs))
            });
        } else {
            revert PendleV2Adapter__InvalidAction();
        }
    }

    /// @dev Helper to add liquidity to a Pendle market from the underlying token of the SY
    function __addLiquidity(address _vaultProxyAddress, AddLiquidityActionArgs memory _actionArgs) private {
        (IPendleV2StandardizedYield syToken,,) = _actionArgs.market.readTokens();

        // Mint SY token from its underlying.
        // We can safely pass in 0 for minSyTokenAmount since we later validate the final minLpAmount.
        uint256 syTokenAmount = __mintSYToken({
            _syToken: syToken,
            _minSyTokenAmount: 0,
            _depositTokenAddressInput: _actionArgs.depositTokenAddress,
            _depositTokenAmount: _actionArgs.depositTokenAmount,
            _receiver: address(this)
        });

        // Grant max SY token allowance to the Router
        __approveAssetMaxAsNeeded({
            _asset: address(syToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: syTokenAmount
        });

        // Unused since we do not need to perform a limit order
        IPendleV2Router.LimitOrderData memory limit;

        // Add liquidity to the market, and transfer LP to vault
        PENDLE_ROUTER.addLiquiditySingleSy({
            _receiver: _vaultProxyAddress,
            _market: address(_actionArgs.market),
            _netSyIn: syTokenAmount,
            _minLpOut: _actionArgs.minLpAmount,
            _guessPtReceivedFromSy: _actionArgs.guessPtReceived,
            _limit: limit
        });
    }

    /// @dev Helper to buy a Pendle PT from the underlying token of the SY
    function __buyPrincipalToken(address _vaultProxyAddress, BuyPrincipalTokenActionArgs memory _actionArgs) private {
        (IPendleV2StandardizedYield syToken,,) = _actionArgs.market.readTokens();

        // Mint SY token from its underlying.
        // We can safely pass in 0 for minSyTokenAmount since we later validate the final minPtAmount.
        uint256 syTokenAmount = __mintSYToken({
            _syToken: syToken,
            _minSyTokenAmount: 0,
            _depositTokenAddressInput: _actionArgs.depositTokenAddress,
            _depositTokenAmount: _actionArgs.depositTokenAmount,
            _receiver: address(this)
        });

        // Grant max SY token allowance to the Router
        __approveAssetMaxAsNeeded({
            _asset: address(syToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: syTokenAmount
        });

        // Unused since we do not need to perform a limit order
        IPendleV2Router.LimitOrderData memory limit;

        // Convert SyToken to PT, and transfer to vault
        PENDLE_ROUTER.swapExactSyForPt({
            _receiver: _vaultProxyAddress,
            _market: address(_actionArgs.market),
            _exactSyIn: syTokenAmount,
            _minPtOut: _actionArgs.minPtAmount,
            _guessPtOut: _actionArgs.guessPtOut,
            _limit: limit
        });
    }

    /// @dev Helper to redeem Pendle LP tokens for the underlying token of the SY
    function __removeLiquidity(address _vaultProxyAddress, RemoveLiquidityActionArgs memory _actionArgs) private {
        // Grant max LP token allowance to the Router
        __approveAssetMaxAsNeeded({
            _asset: address(_actionArgs.market),
            _target: address(PENDLE_ROUTER),
            _neededAmount: _actionArgs.lpAmount
        });

        // Unused since we do not need to perform a limit order.
        IPendleV2Router.LimitOrderData memory limit;

        // Remove liquidity, receive SY
        (uint256 syTokenAmount,) = PENDLE_ROUTER.removeLiquiditySingleSy({
            _receiver: address(this),
            _market: address(_actionArgs.market),
            _netLpToRemove: _actionArgs.lpAmount,
            _minSyOut: _actionArgs.minSyOut,
            _limit: limit
        });

        (IPendleV2StandardizedYield syToken,,) = _actionArgs.market.readTokens();

        // Redeem SY into underlying, transfer to vault
        __redeemSYToken({
            _syToken: syToken,
            _syTokenAmount: syTokenAmount,
            _withdrawalTokenAddressInput: _actionArgs.withdrawalTokenAddress,
            _minWithdrawalTokenAmount: _actionArgs.minWithdrawalTokenAmount,
            _receiver: _vaultProxyAddress
        });
    }

    /// @dev Helper to sell a Pendle PT for the underlying token of the SY
    function __sellPrincipalToken(address _vaultProxyAddress, SellPrincipalTokenActionArgs memory _actionArgs)
        private
    {
        (IPendleV2StandardizedYield syToken, IPendleV2PrincipalToken principalToken, address yieldTokenAddress) =
            _actionArgs.market.readTokens();

        // Grant max PT allowance to the Router
        __approveAssetMaxAsNeeded({
            _asset: address(principalToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: _actionArgs.ptAmount
        });

        // Convert PT to SY.
        // We can safely pass 0 as _minSyOut because we validate the final minWithdrawalTokenAmount.
        uint256 netSyOut;
        if (principalToken.isExpired()) {
            netSyOut = PENDLE_ROUTER.redeemPyToSy({
                _receiver: address(this),
                _YT: yieldTokenAddress,
                _netPyIn: _actionArgs.ptAmount,
                _minSyOut: 0
            });
        } else {
            // Unused since we do not need to perform a limit order
            IPendleV2Router.LimitOrderData memory limit;

            (netSyOut,) = PENDLE_ROUTER.swapExactPtForSy({
                _receiver: address(this),
                _market: address(_actionArgs.market),
                _exactPtIn: _actionArgs.ptAmount,
                _minSyOut: 0,
                _limit: limit
            });
        }

        // Convert SyToken to underlying, and transfer to vault
        __redeemSYToken({
            _syToken: syToken,
            _syTokenAmount: netSyOut,
            _withdrawalTokenAddressInput: _actionArgs.withdrawalTokenAddress,
            _minWithdrawalTokenAmount: _actionArgs.minWithdrawalTokenAmount,
            _receiver: _vaultProxyAddress
        });
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
        if (_selector != ACTION_SELECTOR) revert PendleV2Adapter__InvalidAction();

        // All actions have 1 incoming and 1 outgoing asset
        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        (IPendleV2Adapter.Action actionId, bytes memory encodedActionArgs) = abi.decode(_actionData, (Action, bytes));

        if (actionId == Action.BuyPrincipalToken) {
            BuyPrincipalTokenActionArgs memory actionArgs = abi.decode(encodedActionArgs, (BuyPrincipalTokenActionArgs));

            (, IPendleV2PrincipalToken principalToken,) = actionArgs.market.readTokens();

            spendAssets_[0] = __parseAssetInputForEnzyme(actionArgs.depositTokenAddress);
            spendAssetAmounts_[0] = actionArgs.depositTokenAmount;
            incomingAssets_[0] = address(principalToken);
            minIncomingAssetAmounts_[0] = actionArgs.minPtAmount;
        } else if (actionId == Action.SellPrincipalToken) {
            SellPrincipalTokenActionArgs memory actionArgs =
                abi.decode(encodedActionArgs, (SellPrincipalTokenActionArgs));

            (, IPendleV2PrincipalToken principalToken,) = actionArgs.market.readTokens();

            spendAssets_[0] = address(principalToken);
            spendAssetAmounts_[0] = actionArgs.ptAmount;
            incomingAssets_[0] = __parseAssetInputForEnzyme(actionArgs.withdrawalTokenAddress);
            minIncomingAssetAmounts_[0] = actionArgs.minWithdrawalTokenAmount;
        } else if (actionId == Action.AddLiquidity) {
            AddLiquidityActionArgs memory actionArgs = abi.decode(encodedActionArgs, (AddLiquidityActionArgs));

            spendAssets_[0] = __parseAssetInputForEnzyme(actionArgs.depositTokenAddress);
            spendAssetAmounts_[0] = actionArgs.depositTokenAmount;
            incomingAssets_[0] = address(actionArgs.market);
            minIncomingAssetAmounts_[0] = actionArgs.minLpAmount;
        } else if (actionId == Action.RemoveLiquidity) {
            RemoveLiquidityActionArgs memory actionArgs = abi.decode(encodedActionArgs, (RemoveLiquidityActionArgs));

            spendAssets_[0] = address(actionArgs.market);
            spendAssetAmounts_[0] = actionArgs.lpAmount;
            incomingAssets_[0] = __parseAssetInputForEnzyme(actionArgs.withdrawalTokenAddress);
            minIncomingAssetAmounts_[0] = actionArgs.minWithdrawalTokenAmount;
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    //////////////////
    // MISC HELPERS //
    //////////////////

    /// @dev Helper to mint a Pendle SY token from a depositToken
    function __mintSYToken(
        IPendleV2StandardizedYield _syToken,
        uint256 _minSyTokenAmount,
        address _depositTokenAddressInput,
        uint256 _depositTokenAmount,
        address _receiver
    ) private returns (uint256 syTokenAmount_) {
        uint256 nativeAssetDepositValue;
        address pendleDepositTokenAddress = __parseAssetInputForPendle(_depositTokenAddressInput);
        if (pendleDepositTokenAddress == PENDLE_NATIVE_ASSET_ADDRESS) {
            WRAPPED_NATIVE_ASSET.withdraw(_depositTokenAmount);
            nativeAssetDepositValue = _depositTokenAmount;
        } else {
            __approveAssetMaxAsNeeded({
                _asset: pendleDepositTokenAddress,
                _target: address(_syToken),
                _neededAmount: _depositTokenAmount
            });
        }

        syTokenAmount_ = _syToken.deposit{value: nativeAssetDepositValue}({
            _receiver: _receiver,
            _tokenIn: pendleDepositTokenAddress,
            _amountTokenToDeposit: _depositTokenAmount,
            _minSharesOut: _minSyTokenAmount
        });

        return syTokenAmount_;
    }

    /// @dev Helper to parse the Enzyme native asset address into its wrapped asset address as needed
    function __parseAssetInputForEnzyme(address _assetAddress) private view returns (address parsedAssetAddress_) {
        return _assetAddress == NATIVE_ASSET_ADDRESS ? address(WRAPPED_NATIVE_ASSET) : _assetAddress;
    }

    /// @dev Helper to parse the Enzyme native asset address into the Pendle native asset address as needed
    function __parseAssetInputForPendle(address _assetAddress) private pure returns (address parsedAssetAddress_) {
        return _assetAddress == NATIVE_ASSET_ADDRESS ? PENDLE_NATIVE_ASSET_ADDRESS : _assetAddress;
    }

    /// @dev Helper to redeem a Pendle SY token into a withdrawalToken
    function __redeemSYToken(
        IPendleV2StandardizedYield _syToken,
        uint256 _syTokenAmount,
        address _withdrawalTokenAddressInput,
        uint256 _minWithdrawalTokenAmount,
        address _receiver
    ) private {
        _syToken.redeem({
            _receiver: _receiver,
            _amountSharesToRedeem: _syTokenAmount,
            _tokenOut: __parseAssetInputForPendle(_withdrawalTokenAddressInput),
            _minTokenOut: _minWithdrawalTokenAmount,
            _burnFromInternalBalance: false
        });
    }
}

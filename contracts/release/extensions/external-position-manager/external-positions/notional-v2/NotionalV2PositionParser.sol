// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {INotionalV2Router} from "../../../../../external-interfaces/INotionalV2Router.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {INotionalV2Position} from "./INotionalV2Position.sol";
import {NotionalV2PositionDataDecoder} from "./NotionalV2PositionDataDecoder.sol";

/// @title NotionalV2PositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for Notional V2 Positions
contract NotionalV2PositionParser is NotionalV2PositionDataDecoder, IExternalPositionParser {
    uint16 private constant ETH_CURRENCY_ID = 1;

    uint8 private constant BORROW_TRADE_ACTION_TYPE = 1;
    uint8 private constant LEND_TRADE_ACTION_TYPE = 0;

    INotionalV2Router private immutable NOTIONAL_V2_ROUTER_CONTRACT;
    address private immutable WETH_TOKEN;

    constructor(address _notionalV2Router, address _weth) public {
        NOTIONAL_V2_ROUTER_CONTRACT = INotionalV2Router(_notionalV2Router);
        WETH_TOKEN = _weth;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(INotionalV2Position.Actions.AddCollateral)) {
            (uint16 currencyId, uint256 collateralAssetAmount) = __decodeAddCollateralActionArgs(_encodedActionArgs);

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = __getAssetForCurrencyId(currencyId);
            amountsToTransfer_[0] = collateralAssetAmount;
        } else if (_actionId == uint256(INotionalV2Position.Actions.Lend)) {
            (uint16 currencyId, uint256 underlyingAssetAmount, bytes32 encodedTrade) =
                __decodeLendActionArgs(_encodedActionArgs);

            require(
                uint8(bytes1(encodedTrade)) == LEND_TRADE_ACTION_TYPE,
                "parseAssetsForAction: Incorrect trade action type"
            );

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = __getAssetForCurrencyId(currencyId);
            amountsToTransfer_[0] = underlyingAssetAmount;
        } else if (_actionId == uint256(INotionalV2Position.Actions.Redeem)) {
            (uint16 currencyId,) = __decodeRedeemActionArgs(_encodedActionArgs);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = __getAssetForCurrencyId(currencyId);
        } else if (_actionId == uint256(INotionalV2Position.Actions.Borrow)) {
            (uint16 borrowCurrencyId, bytes32 encodedTrade, uint16 collateralCurrencyId, uint256 collateralAssetAmount)
            = __decodeBorrowActionArgs(_encodedActionArgs);

            require(
                uint8(bytes1(encodedTrade)) == BORROW_TRADE_ACTION_TYPE,
                "parseAssetsForAction: Incorrect trade action type"
            );

            if (collateralAssetAmount > 0) {
                assetsToTransfer_ = new address[](1);
                amountsToTransfer_ = new uint256[](1);

                assetsToTransfer_[0] = __getAssetForCurrencyId(collateralCurrencyId);
                amountsToTransfer_[0] = collateralAssetAmount;
            }

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = __getAssetForCurrencyId(borrowCurrencyId);
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Unused
    function parseInitArgs(address, bytes memory) external override returns (bytes memory) {
        return "";
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to get the asset for a given Notional currencyId
    function __getAssetForCurrencyId(uint16 _currencyId) private view returns (address asset_) {
        if (_currencyId == ETH_CURRENCY_ID) {
            return WETH_TOKEN;
        }

        (, INotionalV2Router.Token memory token) = NOTIONAL_V2_ROUTER_CONTRACT.getCurrency(_currencyId);

        return token.tokenAddress;
    }
}

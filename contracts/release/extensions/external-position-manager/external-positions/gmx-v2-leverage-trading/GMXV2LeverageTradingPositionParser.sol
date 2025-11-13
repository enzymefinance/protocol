// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IGMXV2DataStore} from "../../../../../external-interfaces/IGMXV2DataStore.sol";
import {IGMXV2Order} from "../../../../../external-interfaces/IGMXV2Order.sol";
import {IGMXV2Reader} from "../../../../../external-interfaces/IGMXV2Reader.sol";

import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";

import {IExternalPositionParser} from "../../IExternalPositionParser.sol";

import {IGMXV2LeverageTradingPosition} from "./IGMXV2LeverageTradingPosition.sol";

pragma solidity 0.8.19;

/// @title GMXV2LeverageTradingPositionParser
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Parser for GMXV2 Leverage Trading Positions
contract GMXV2LeverageTradingPositionParser is IExternalPositionParser {
    address private immutable DATA_STORE_ADDRESS;
    IGMXV2Reader private immutable READER;
    address private immutable WRAPPED_NATIVE_TOKEN_ADDRESS;

    using AddressArrayLib for address[];

    constructor(address _wrappedNativeTokenAddress, address _dataStoreAddress, IGMXV2Reader _reader) {
        WRAPPED_NATIVE_TOKEN_ADDRESS = _wrappedNativeTokenAddress;
        DATA_STORE_ADDRESS = _dataStoreAddress;
        READER = _reader;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPositionAddress The _externalPositionAddress to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(address _externalPositionAddress, uint256 _actionId, bytes memory _encodedActionArgs)
        external
        view
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (_actionId == uint256(IGMXV2LeverageTradingPosition.Actions.CreateOrder)) {
            IGMXV2LeverageTradingPosition.CreateOrderActionArgs memory createOrderArgs =
                abi.decode(_encodedActionArgs, (IGMXV2LeverageTradingPosition.CreateOrderActionArgs));

            if (createOrderArgs.orderType == IGMXV2Order.OrderType.MarketIncrease) {
                address collateralToken = createOrderArgs.addresses.initialCollateralToken;

                // related code: https://github.com/gmx-io/gmx-synthetics/blob/5173cbeb196ed5596373acd71c75a5c7a60a98f5/contracts/order/OrderUtils.sol#L81
                if (collateralToken == WRAPPED_NATIVE_TOKEN_ADDRESS) {
                    assetsToTransfer_ = new address[](1);
                    amountsToTransfer_ = new uint256[](1);

                    assetsToTransfer_[0] = collateralToken;
                    amountsToTransfer_[0] = createOrderArgs.numbers.initialCollateralDeltaAmount;
                } else {
                    assetsToTransfer_ = new address[](2);
                    amountsToTransfer_ = new uint256[](2);

                    assetsToTransfer_[0] = WRAPPED_NATIVE_TOKEN_ADDRESS;
                    amountsToTransfer_[0] = createOrderArgs.numbers.executionFee;

                    assetsToTransfer_[1] = collateralToken;
                    amountsToTransfer_[1] = createOrderArgs.numbers.initialCollateralDeltaAmount;
                }
            } else {
                assetsToTransfer_ = new address[](1);
                amountsToTransfer_ = new uint256[](1);

                assetsToTransfer_[0] = WRAPPED_NATIVE_TOKEN_ADDRESS;
                amountsToTransfer_[0] = createOrderArgs.numbers.executionFee;
            }
        } else if (_actionId == uint256(IGMXV2LeverageTradingPosition.Actions.UpdateOrder)) {
            IGMXV2LeverageTradingPosition.UpdateOrderActionArgs memory updateOrderArgs =
                abi.decode(_encodedActionArgs, (IGMXV2LeverageTradingPosition.UpdateOrderActionArgs));

            if (updateOrderArgs.executionFeeIncrease != 0) {
                assetsToTransfer_ = new address[](1);
                amountsToTransfer_ = new uint256[](1);

                assetsToTransfer_[0] = WRAPPED_NATIVE_TOKEN_ADDRESS;
                amountsToTransfer_[0] = updateOrderArgs.executionFeeIncrease;
            }
        } else if (_actionId == uint256(IGMXV2LeverageTradingPosition.Actions.CancelOrder)) {
            IGMXV2LeverageTradingPosition.CancelOrderActionArgs memory cancelOrderArgs =
                abi.decode(_encodedActionArgs, (IGMXV2LeverageTradingPosition.CancelOrderActionArgs));

            IGMXV2Order.Props memory order =
                READER.getOrder({_dataStore: IGMXV2DataStore(DATA_STORE_ADDRESS), _orderKey: cancelOrderArgs.key});

            if (order.numbers.orderType == IGMXV2Order.OrderType.MarketIncrease) {
                if (order.addresses.initialCollateralToken == WRAPPED_NATIVE_TOKEN_ADDRESS) {
                    assetsToReceive_ = new address[](1);
                    assetsToReceive_[0] = order.addresses.initialCollateralToken;
                } else {
                    assetsToReceive_ = new address[](2);
                    assetsToReceive_[0] = WRAPPED_NATIVE_TOKEN_ADDRESS;
                    assetsToReceive_[1] = order.addresses.initialCollateralToken;
                }
            } else {
                assetsToReceive_ = new address[](1);
                assetsToReceive_[0] = WRAPPED_NATIVE_TOKEN_ADDRESS;
            }
        } else if (_actionId == uint256(IGMXV2LeverageTradingPosition.Actions.ClaimFundingFees)) {
            IGMXV2LeverageTradingPosition.ClaimFundingFeesActionArgs memory claimFundingFeesArgs =
                abi.decode(_encodedActionArgs, (IGMXV2LeverageTradingPosition.ClaimFundingFeesActionArgs));

            assetsToReceive_ = claimFundingFeesArgs.tokens;
        } else if (_actionId == uint256(IGMXV2LeverageTradingPosition.Actions.ClaimCollateral)) {
            IGMXV2LeverageTradingPosition.ClaimCollateralActionArgs memory claimCollateralArgs =
                abi.decode(_encodedActionArgs, (IGMXV2LeverageTradingPosition.ClaimCollateralActionArgs));

            assetsToReceive_ = claimCollateralArgs.tokens;
        } else if (_actionId == uint256(IGMXV2LeverageTradingPosition.Actions.Sweep)) {
            assetsToReceive_ = IGMXV2LeverageTradingPosition(_externalPositionAddress).getTrackedAssets()
                .addUniqueItem(WRAPPED_NATIVE_TOKEN_ADDRESS);
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @return initArgs_ Parsed and encoded args for ExternalPositionProxy.init()
    function parseInitArgs(address, bytes memory) external pure override returns (bytes memory) {
        return "";
    }
}

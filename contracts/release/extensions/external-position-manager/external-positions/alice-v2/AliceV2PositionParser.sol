// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IAliceInstantOrderV2} from "../../../../../external-interfaces/IAliceInstantOrderV2.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {Uint256ArrayLib} from "../../../../../utils/0.8.19/Uint256ArrayLib.sol";
import {IExternalPositionParser} from "../../IExternalPositionParser.sol";
import {AliceV2PositionLibBase1} from "./bases/AliceV2PositionLibBase1.sol";
import {IAliceV2Position} from "./IAliceV2Position.sol";

/// @title AliceV2PositionParser
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Parser for Morpho Positions
contract AliceV2PositionParser is IExternalPositionParser {
    using AddressArrayLib for address[];
    using Uint256ArrayLib for uint256[];

    address public constant ALICE_NATIVE_ETH = address(0);
    IAliceInstantOrderV2 public immutable ALICE_V2_ORDER_MANAGER;
    address public immutable WRAPPED_NATIVE_TOKEN_ADDRESS;

    error InvalidActionId();

    error DuplicateOrderId();

    error UnknownOrderId();

    constructor(address _aliceV2OrderManagerAddress, address _wrappedNativeAssetAddress) {
        ALICE_V2_ORDER_MANAGER = IAliceInstantOrderV2(_aliceV2OrderManagerAddress);
        WRAPPED_NATIVE_TOKEN_ADDRESS = _wrappedNativeAssetAddress;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPositionAddress The address of the ExternalPositionProxy
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
        if (_actionId == uint256(IAliceV2Position.Actions.PlaceOrder)) {
            IAliceV2Position.PlaceOrderActionArgs memory placeOrderArgs =
                abi.decode(_encodedActionArgs, (IAliceV2Position.PlaceOrderActionArgs));

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);

            assetsToTransfer_[0] = __parseAliceV2Asset({_rawAssetAddress: placeOrderArgs.tokenToSell});
            amountsToTransfer_[0] = placeOrderArgs.quantityToSell;
        } else if (_actionId == uint256(IAliceV2Position.Actions.Sweep)) {
            IAliceV2Position.SweepActionArgs memory sweepArgs =
                abi.decode(_encodedActionArgs, (IAliceV2Position.SweepActionArgs));

            // Validate input: check for duplicates and unknown order IDs
            __validateSweepOrderIds(_externalPositionAddress, sweepArgs.orderIds);

            // Sweep can return either the outgoing or incoming asset (depending on if order is settled or cancelled) so we need to include both
            for (uint256 i; i < sweepArgs.orderIds.length; i++) {
                AliceV2PositionLibBase1.OrderDetails memory orderDetails =
                    IAliceV2Position(_externalPositionAddress).getOrderDetails(sweepArgs.orderIds[i]);

                uint256 outgoingAssetBalance = orderDetails.outgoingAssetAddress == ALICE_NATIVE_ETH
                    ? _externalPositionAddress.balance
                    : IERC20(orderDetails.outgoingAssetAddress).balanceOf(_externalPositionAddress);
                uint256 incomingAssetBalance = orderDetails.incomingAssetAddress == ALICE_NATIVE_ETH
                    ? _externalPositionAddress.balance
                    : IERC20(orderDetails.incomingAssetAddress).balanceOf(_externalPositionAddress);

                if (outgoingAssetBalance > 0) {
                    assetsToReceive_ = assetsToReceive_.addUniqueItem(
                        __parseAliceV2Asset({_rawAssetAddress: orderDetails.outgoingAssetAddress})
                    );
                }

                if (incomingAssetBalance > 0) {
                    assetsToReceive_ = assetsToReceive_.addUniqueItem(
                        __parseAliceV2Asset({_rawAssetAddress: orderDetails.incomingAssetAddress})
                    );
                }
            }
        } else if (_actionId == uint256(IAliceV2Position.Actions.RefundOrder)) {
            IAliceV2Position.RefundOrderActionArgs memory refundOrderArgs =
                abi.decode(_encodedActionArgs, (IAliceV2Position.RefundOrderActionArgs));

            AliceV2PositionLibBase1.OrderDetails memory orderDetails =
                IAliceV2Position(_externalPositionAddress).getOrderDetails(refundOrderArgs.orderId);

            assetsToReceive_ = new address[](1);
            assetsToReceive_[0] = __parseAliceV2Asset({_rawAssetAddress: orderDetails.outgoingAssetAddress});
        } else if (_actionId == uint256(IAliceV2Position.Actions.PlaceOrderWithRefId)) {
            IAliceV2Position.PlaceOrderActionArgs memory placeOrderWithRefIdArgs =
                abi.decode(_encodedActionArgs, (IAliceV2Position.PlaceOrderActionArgs));

            assetsToTransfer_ = new address[](1);
            amountsToTransfer_ = new uint256[](1);
            assetsToReceive_ = new address[](2);

            assetsToTransfer_[0] = __parseAliceV2Asset({_rawAssetAddress: placeOrderWithRefIdArgs.tokenToSell});
            amountsToTransfer_[0] = placeOrderWithRefIdArgs.quantityToSell;
            // Adding the incoming token since this can be settled externally
            assetsToReceive_[0] = __parseAliceV2Asset({_rawAssetAddress: placeOrderWithRefIdArgs.tokenToBuy});
            // Adding the outgoing token since this can be cancelled externally
            assetsToReceive_[1] = __parseAliceV2Asset({_rawAssetAddress: placeOrderWithRefIdArgs.tokenToSell});
        } else {
            revert InvalidActionId();
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @dev Parses AliceV2 Native Asset into the wrapped native asset, otherwise returns the asset unchanged.
    function __parseAliceV2Asset(address _rawAssetAddress) private view returns (address parsedAssetAddress_) {
        return _rawAssetAddress == ALICE_NATIVE_ETH ? WRAPPED_NATIVE_TOKEN_ADDRESS : _rawAssetAddress;
    }

    /// @dev Helper to validate sweep order IDs for duplicates and unknown orders
    function __validateSweepOrderIds(address _externalPositionAddress, uint256[] memory _orderIds) private view {
        // Check for duplicates using Uint256ArrayLib helper
        if (!_orderIds.isUniqueSet()) {
            revert DuplicateOrderId();
        }

        // Check for unknown order IDs
        for (uint256 i; i < _orderIds.length; i++) {
            AliceV2PositionLibBase1.OrderDetails memory orderDetails =
                IAliceV2Position(_externalPositionAddress).getOrderDetails(_orderIds[i]);
            if (orderDetails.outgoingAssetAddress == address(0) && orderDetails.incomingAssetAddress == address(0)) {
                revert UnknownOrderId();
            }
        }
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    function parseInitArgs(address, bytes memory) external pure override returns (bytes memory) {
        return "";
    }
}

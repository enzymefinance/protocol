// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IAliceInstantOrderV2} from "../../../../../external-interfaces/IAliceInstantOrderV2.sol";
import {IAliceReferenceIdReceiver} from "../../../../../external-interfaces/IAliceReferenceIdReceiver.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {IExternalPositionProxy} from "../../../../../persistent/external-positions/IExternalPositionProxy.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {Uint256ArrayLib} from "../../../../../utils/0.8.19/Uint256ArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {AliceV2PositionLibBase1} from "./bases/AliceV2PositionLibBase1.sol";
import {IAliceV2Position} from "./IAliceV2Position.sol";

/// @title AliceV2PositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for AliceV2 positions
contract AliceV2PositionLib is IAliceV2Position, AliceV2PositionLibBase1, AssetHelpers, IAliceReferenceIdReceiver {
    using AddressArrayLib for address[];
    using SafeERC20 for IERC20;
    using Uint256ArrayLib for uint256[];

    address public constant ALICEV2_NATIVE_ASSET_ADDRESS = address(0);
    IAliceInstantOrderV2 public immutable ALICE_INSTANT_ORDER_V2;
    IWETH public immutable WRAPPED_NATIVE_TOKEN;

    error InvalidActionId();

    error InvalidSender();

    error OrderNotSettledOrCancelled();

    error InvalidReferenceId();

    constructor(address _aliceV2OrderManagerAddress, address _wrappedNativeAssetAddress) {
        ALICE_INSTANT_ORDER_V2 = IAliceInstantOrderV2(_aliceV2OrderManagerAddress);
        WRAPPED_NATIVE_TOKEN = IWETH(_wrappedNativeAssetAddress);
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.PlaceOrder)) {
            __placeOrder(actionArgs);
        } else if (actionId == uint256(Actions.Sweep)) {
            __sweep(actionArgs);
        } else if (actionId == uint256(Actions.RefundOrder)) {
            __refundOrder(actionArgs);
        } else if (actionId == uint256(Actions.PlaceOrderWithRefId)) {
            __placeOrderWithRefId(actionArgs);
        } else {
            revert InvalidActionId();
        }
    }

    /////////////////////////
    // EXTERNAL FUNCTIONS //
    ////////////////////////

    function notifySettle(address, uint256, bytes32 _referenceId) external override {
        if (msg.sender != address(ALICE_INSTANT_ORDER_V2)) {
            revert InvalidSender();
        }

        // Validate that the reference ID is pending and has been created by this external position
        if (!isPendingReferenceId(_referenceId)) {
            revert InvalidReferenceId();
        }

        uint256 orderId = uint256(_referenceId);

        // Verify that order has actually been settled or cancelled.
        // Prevents external parties from triggering a `notifySettle` through a malicious order.
        if (!__isOrderSettledOrCancelled({_orderId: orderId})) {
            revert OrderNotSettledOrCancelled();
        }

        // Find the stored order details
        OrderDetails memory orderDetails = getOrderDetails({_orderId: orderId});

        // Remove the order from storage
        __removeOrder({_orderId: orderId});

        // Remove the reference ID from storage
        __removeReferenceId({_referenceId: _referenceId});

        // Push the assets back to the vault. Sweeping both assets in case Alice offchain logic fails.
        __retrieveAssetBalance({
            _asset: IERC20(orderDetails.outgoingAssetAddress),
            _receiver: IExternalPositionProxy(address(this)).getVaultProxy()
        });

        __retrieveAssetBalance({
            _asset: IERC20(orderDetails.incomingAssetAddress),
            _receiver: IExternalPositionProxy(address(this)).getVaultProxy()
        });
    }

    function notifyCancel(bytes32 _referenceId) external override {
        if (msg.sender != address(ALICE_INSTANT_ORDER_V2)) {
            revert InvalidSender();
        }

        // Validate that the reference ID is pending and has been created by this external position
        if (!isPendingReferenceId(_referenceId)) {
            revert InvalidReferenceId();
        }

        uint256 orderId = uint256(_referenceId);

        // Verify that order has actually been settled or cancelled.
        // Prevents external parties from triggering a `notifySettle` through a malicious order.
        if (!__isOrderSettledOrCancelled({_orderId: orderId})) {
            revert OrderNotSettledOrCancelled();
        }

        // Find the stored order details
        OrderDetails memory orderDetails = getOrderDetails({_orderId: orderId});

        // Remove the order from storage
        __removeOrder({_orderId: orderId});

        // Remove the reference ID from storage
        __removeReferenceId({_referenceId: _referenceId});

        // Push the assets back to the vault. Sweeping both assets in case Alice offchain logic fails.
        __retrieveAssetBalance({
            _asset: IERC20(orderDetails.outgoingAssetAddress),
            _receiver: IExternalPositionProxy(address(this)).getVaultProxy()
        });

        __retrieveAssetBalance({
            _asset: IERC20(orderDetails.incomingAssetAddress),
            _receiver: IExternalPositionProxy(address(this)).getVaultProxy()
        });
    }

    ////////////////////
    // ACTION HELPERS //
    ////////////////////

    /// @dev Helper to prepare order by adding to storage and handling asset approval/unwrapping
    function __prepareOrder(IAliceV2Position.PlaceOrderActionArgs memory _placeOrderArgs)
        private
        returns (uint256 nativeAssetAmount)
    {
        address outgoingAssetAddress = _placeOrderArgs.tokenToSell;
        address incomingAssetAddress = _placeOrderArgs.tokenToBuy;

        __addOrder({
            _orderDetails: OrderDetails({
                outgoingAssetAddress: outgoingAssetAddress,
                incomingAssetAddress: incomingAssetAddress,
                outgoingAmount: _placeOrderArgs.quantityToSell
            })
        });

        if (outgoingAssetAddress == ALICEV2_NATIVE_ASSET_ADDRESS) {
            // If spendAsset is the native asset, unwrap WETH.
            nativeAssetAmount = _placeOrderArgs.quantityToSell;
            WRAPPED_NATIVE_TOKEN.withdraw(nativeAssetAmount);
        } else {
            // Approve the spend asset
            IERC20(outgoingAssetAddress)
                .safeApprove({_spender: address(ALICE_INSTANT_ORDER_V2), _value: _placeOrderArgs.quantityToSell});
        }
    }

    /// @dev Helper to place an order on the AliceV2 Order Manager
    function __placeOrder(bytes memory _actionArgs) private {
        IAliceV2Position.PlaceOrderActionArgs memory placeOrderArgs =
            abi.decode(_actionArgs, (IAliceV2Position.PlaceOrderActionArgs));

        uint256 nativeAssetAmount = __prepareOrder(placeOrderArgs);

        // Place the order
        ALICE_INSTANT_ORDER_V2.placeOrder{value: nativeAssetAmount}({
            _tokenToSell: placeOrderArgs.tokenToSell,
            _tokenToBuy: placeOrderArgs.tokenToBuy,
            _quantityToSell: placeOrderArgs.quantityToSell,
            _limitAmountToGet: placeOrderArgs.limitAmountToGet
        });
    }

    /// @dev Helper to sweep balance from settled or cancelled orders and clear storage
    function __sweep(bytes memory _actionsArgs) private {
        IAliceV2Position.SweepActionArgs memory sweepArgs = abi.decode(_actionsArgs, (IAliceV2Position.SweepActionArgs));

        for (uint256 i; i < sweepArgs.orderIds.length; i++) {
            uint256 orderId = sweepArgs.orderIds[i];

            if (!__isOrderSettledOrCancelled({_orderId: orderId})) {
                revert OrderNotSettledOrCancelled();
            }

            OrderDetails memory orderDetails = getOrderDetails({_orderId: orderId});

            // If a reference ID exists for this order, remove it
            // This could theoretically happen if the callback methods fail for an order placed with reference ID
            if (isPendingReferenceId(bytes32(orderId))) {
                __removeReferenceId({_referenceId: bytes32(orderId)});
            }

            __removeOrder({_orderId: orderId});

            // If the order is settled or cancelled, the EP could have received:
            // The incomingAsset if the order has been settled
            // The outgoingAsset if the order has been cancelled
            __retrieveAssetBalance({_asset: IERC20(orderDetails.incomingAssetAddress), _receiver: msg.sender});
            __retrieveAssetBalance({_asset: IERC20(orderDetails.outgoingAssetAddress), _receiver: msg.sender});
        }
    }

    /// @dev Helper to refund an outstanding order
    function __refundOrder(bytes memory _actionsArgs) private {
        IAliceV2Position.RefundOrderActionArgs memory refundOrderArgs =
            abi.decode(_actionsArgs, (IAliceV2Position.RefundOrderActionArgs));

        // Remove the order from storage
        __removeOrder({_orderId: refundOrderArgs.orderId});

        // Refund the order
        ALICE_INSTANT_ORDER_V2.refundOrder({
            _orderId: refundOrderArgs.orderId,
            _user: address(this),
            _tokenToSell: refundOrderArgs.tokenToSell,
            _tokenToBuy: refundOrderArgs.tokenToBuy,
            _quantityToSell: refundOrderArgs.quantityToSell,
            _limitAmountToGet: refundOrderArgs.limitAmountToGet,
            _timestamp: refundOrderArgs.timestamp
        });

        // Return the refunded outgoing asset back to the vault using the existing helper
        __retrieveAssetBalance({_asset: IERC20(refundOrderArgs.tokenToSell), _receiver: msg.sender});
    }

    /// @dev Helper to place an order with a reference ID
    function __placeOrderWithRefId(bytes memory _actionArgs) private {
        IAliceV2Position.PlaceOrderActionArgs memory placeOrderArgs =
            abi.decode(_actionArgs, (IAliceV2Position.PlaceOrderActionArgs));

        uint256 nativeAssetAmount = __prepareOrder(placeOrderArgs);

        // Generate a unique reference ID for this external position
        bytes32 referenceId = bytes32(ALICE_INSTANT_ORDER_V2.getMostRecentOrderId() + 1);

        // Track the reference ID
        __addReferenceId({_referenceId: referenceId});

        // Place the order
        ALICE_INSTANT_ORDER_V2.placeOrder{value: nativeAssetAmount}({
            _tokenToSell: placeOrderArgs.tokenToSell,
            _tokenToBuy: placeOrderArgs.tokenToBuy,
            _quantityToSell: placeOrderArgs.quantityToSell,
            _limitAmountToGet: placeOrderArgs.limitAmountToGet,
            _receiver: address(this),
            _referenceId: referenceId
        });
    }

    /// @dev Helper to add the orderId to storage
    function __addOrder(OrderDetails memory _orderDetails) private {
        uint256 orderId = ALICE_INSTANT_ORDER_V2.getMostRecentOrderId() + 1;

        orderIds.push(orderId);
        orderIdToOrderDetails[orderId] = _orderDetails;

        emit OrderIdAdded(orderId, _orderDetails);
    }

    /// @dev Helper to add a reference ID to storage
    function __addReferenceId(bytes32 _referenceId) private {
        referenceIdToIsPending[_referenceId] = true;
        emit ReferenceIdAdded(_referenceId);
    }

    /// @dev Helper to check whether an order has settled or been cancelled
    function __isOrderSettledOrCancelled(uint256 _orderId) private view returns (bool isSettledOrCancelled_) {
        // When an order has been settled or cancelled, its orderHash getter will throw
        try ALICE_INSTANT_ORDER_V2.getOrderHash({_orderId: _orderId}) {
            return false;
        } catch {
            return true;
        }
    }

    /// @dev Helper to remove the orderId from storage
    function __removeOrder(uint256 _orderId) private {
        orderIds.removeStorageItem(_orderId);

        // Reset the mapping
        delete orderIdToOrderDetails[_orderId];

        emit OrderIdRemoved(_orderId);
    }

    /// @dev Helper to remove a reference ID from storage
    function __removeReferenceId(bytes32 _referenceId) private {
        delete referenceIdToIsPending[_referenceId];
        emit ReferenceIdRemoved(_referenceId);
    }

    /// @dev Helper to send the balance of an AliceV2 order asset to the Vault
    function __retrieveAssetBalance(IERC20 _asset, address _receiver) private {
        uint256 balance =
            address(_asset) == ALICEV2_NATIVE_ASSET_ADDRESS ? address(this).balance : _asset.balanceOf(address(this));

        if (balance > 0) {
            // Transfer the asset
            if (address(_asset) == ALICEV2_NATIVE_ASSET_ADDRESS) {
                Address.sendValue(payable(_receiver), balance);
            } else {
                _asset.safeTransfer(_receiver, balance);
            }
        }
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {}

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 2 ways that positive value can be contributed to this position
    /// 1. Tokens held by the EP either as a result of order settlements or as a result of order cancellations
    /// 2. Tokens held in pending (unfulfilled and uncancelled) orders
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        uint256[] memory orderIdsMem = getOrderIds();

        address[] memory receivableAssets;

        for (uint256 i; i < orderIdsMem.length; i++) {
            OrderDetails memory orderDetails = getOrderDetails({_orderId: orderIdsMem[i]});

            bool settledOrCancelled = __isOrderSettledOrCancelled({_orderId: orderIdsMem[i]});

            // If the order is settled or cancelled, the EP will have received the incomingAsset or the outgoingAsset
            // Incoming assets can be received through order settlements
            // Outgoing assets can be received back through order cancellations
            // We have no way of differentiating between the two, so we must add both to the expected assets
            if (settledOrCancelled) {
                receivableAssets = receivableAssets.addUniqueItem(orderDetails.outgoingAssetAddress);
                receivableAssets = receivableAssets.addUniqueItem(orderDetails.incomingAssetAddress);
            } else {
                // If the order is not settled, value the position for its refundable value
                assets_ = assets_.addItem(
                    orderDetails.outgoingAssetAddress == ALICEV2_NATIVE_ASSET_ADDRESS
                        ? address(WRAPPED_NATIVE_TOKEN)
                        : orderDetails.outgoingAssetAddress
                );
                amounts_ = amounts_.addItem(orderDetails.outgoingAmount);
            }
        }

        // Check the balance EP balance of each asset that could be received
        for (uint256 i; i < receivableAssets.length; i++) {
            address receivableAssetAddress = receivableAssets[i];

            uint256 balance = receivableAssetAddress == ALICEV2_NATIVE_ASSET_ADDRESS
                ? address(this).balance
                : IERC20(receivableAssetAddress).balanceOf(address(this));

            if (balance == 0) {
                continue;
            }

            assets_ = assets_.addItem(
                receivableAssetAddress == ALICEV2_NATIVE_ASSET_ADDRESS
                    ? address(WRAPPED_NATIVE_TOKEN)
                    : receivableAssetAddress
            );
            amounts_ = amounts_.addItem(balance);
        }

        return __aggregateAssetAmounts({_rawAssets: assets_, _rawAmounts: amounts_});
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get the orderDetails of a specified orderId
    /// @return orderDetails_ The orderDetails
    function getOrderDetails(uint256 _orderId) public view override returns (OrderDetails memory orderDetails_) {
        return orderIdToOrderDetails[_orderId];
    }

    /// @notice Get the pending orderIds of the external position
    /// @return orderIds_ The orderIds
    function getOrderIds() public view override returns (uint256[] memory orderIds_) {
        return orderIds;
    }

    /// @notice Get whether a referenceId belongs to a pending order or not
    /// @return isPending_ Whether the referenceId belongs to a pending order or not
    function isPendingReferenceId(bytes32 _referenceId) public view override returns (bool isPending_) {
        return referenceIdToIsPending[_referenceId];
    }
}

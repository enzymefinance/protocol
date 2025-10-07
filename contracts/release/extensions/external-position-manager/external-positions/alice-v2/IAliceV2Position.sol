// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";
import {AliceV2PositionLibBase1} from "./bases/AliceV2PositionLibBase1.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IAliceV2Position Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IAliceV2Position is IExternalPosition {
    enum Actions {
        PlaceOrder,
        RefundOrder,
        Sweep,
        PlaceOrderWithRefId
    }

    struct PlaceOrderActionArgs {
        address tokenToSell;
        address tokenToBuy;
        uint256 quantityToSell;
        uint256 limitAmountToGet;
    }

    struct SweepActionArgs {
        uint256[] orderIds;
    }

    struct RefundOrderActionArgs {
        uint256 orderId;
        address tokenToSell;
        address tokenToBuy;
        uint256 quantityToSell;
        uint256 limitAmountToGet;
        uint256 timestamp;
    }

    function getOrderDetails(uint256 _orderId)
        external
        view
        returns (AliceV2PositionLibBase1.OrderDetails memory orderDetails_);

    function getOrderIds() external view returns (uint256[] memory orderIds_);

    function isPendingReferenceId(bytes32 _referenceId) external view returns (bool isPending_);
}

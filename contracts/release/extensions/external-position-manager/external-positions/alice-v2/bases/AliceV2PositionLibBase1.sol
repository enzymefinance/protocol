// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title AliceV2PositionLibBase1 Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a AliceV2PositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered AliceV2PositionLibBaseXXX that inherits the previous base.
/// e.g., `AliceV2PositionLibBase2 is AliceV2PositionLibBase1`
abstract contract AliceV2PositionLibBase1 {
    struct OrderDetails {
        address outgoingAssetAddress;
        address incomingAssetAddress;
        uint256 outgoingAmount;
    }

    event OrderIdAdded(uint256 indexed orderId, OrderDetails orderDetails);

    event OrderIdRemoved(uint256 indexed orderId);

    event ReferenceIdAdded(bytes32 indexed referenceId);

    event ReferenceIdRemoved(bytes32 indexed referenceId);

    uint256[] internal orderIds;

    mapping(uint256 orderId => OrderDetails) orderIdToOrderDetails;

    mapping(bytes32 referenceId => bool isPending) internal referenceIdToIsPending;
}

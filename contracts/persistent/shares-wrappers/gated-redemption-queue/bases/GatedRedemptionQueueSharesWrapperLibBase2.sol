// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./GatedRedemptionQueueSharesWrapperLibBase1.sol";

/// @title GatedRedemptionQueueSharesWrapperLibBase2 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base implementation for GatedRedemptionQueueSharesWrapperLib
/// @dev Each next base implementation inherits the previous base implementation,
/// e.g., `GatedRedemptionQueueSharesWrapperLibBase2 is GatedRedemptionQueueSharesWrapperLibBase1`
/// DO NOT EDIT CONTRACT.
abstract contract GatedRedemptionQueueSharesWrapperLibBase2 is
    GatedRedemptionQueueSharesWrapperLibBase1
{
    enum DepositMode {
        Direct,
        Request
    }

    event DepositModeSet(DepositMode mode);

    event DepositRequestAdded(
        address indexed user,
        address indexed depositAsset,
        uint256 depositAssetAmount
    );

    event DepositRequestRemoved(address indexed user, address indexed depositAsset);

    event TransferForced(address indexed sender, address indexed recipient, uint256 amount);

    struct DepositQueue {
        mapping(address => DepositRequest) userToRequest;
        address[] users;
    }

    struct DepositRequest {
        uint64 index;
        uint128 assetAmount;
    }

    DepositMode internal depositMode;
    mapping(address => DepositQueue) internal depositAssetToQueue;
}

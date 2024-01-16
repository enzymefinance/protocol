// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {ERC20 as OpenZeppelinERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "openzeppelin-solc-0.6/utils/ReentrancyGuard.sol";
import {IGatedRedemptionQueueSharesWrapper} from "../IGatedRedemptionQueueSharesWrapper.sol";

/// @title GatedRedemptionQueueSharesWrapperLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base implementation for GatedRedemptionQueueSharesWrapperLib
/// @dev Each next base implementation inherits the previous base implementation,
/// e.g., `GatedRedemptionQueueSharesWrapperLibBase2 is GatedRedemptionQueueSharesWrapperLibBase1`
/// DO NOT EDIT CONTRACT.
abstract contract GatedRedemptionQueueSharesWrapperLibBase1 is OpenZeppelinERC20, ReentrancyGuard {
    event DepositApproval(address indexed user, address indexed asset, uint256 amount);

    event Deposited(
        address indexed user, address indexed depositToken, uint256 depositTokenAmount, uint256 sharesReceived
    );

    event DepositModeSet(IGatedRedemptionQueueSharesWrapper.DepositMode mode);

    event DepositRequestAdded(address indexed user, address indexed depositAsset, uint256 depositAssetAmount);

    event DepositRequestRemoved(address indexed user, address indexed depositAsset);

    event Initialized(address indexed vaultProxy);

    event Kicked(address indexed user, uint256 sharesAmount);

    event ManagerAdded(address indexed user);

    event ManagerRemoved(address indexed user);

    event Redeemed(
        address indexed user, uint256 sharesAmount, address indexed redemptionAsset, uint256 redemptionAssetAmount
    );

    event RedemptionApproval(address indexed user, uint256 amount);

    event RedemptionAssetSet(address indexed asset);

    event RedemptionRequestAdded(address indexed user, uint256 sharesAmount);

    event RedemptionRequestRemoved(address indexed user);

    event RedemptionWindowConfigSet(
        uint256 firstWindowStart, uint256 frequency, uint256 duration, uint256 relativeSharesCap
    );

    event TransferApproval(address indexed sender, address indexed recipient, uint256 amount);

    event TransferForced(address indexed sender, address indexed recipient, uint256 amount);

    event UseDepositApprovalsSet(bool useApprovals);

    event UseRedemptionApprovalsSet(bool useApprovals);

    event UseTransferApprovalsSet(bool useApprovals);

    // Packing vaultProxy with depositMode and useDepositApprovals makes deposits slightly cheaper
    address internal vaultProxy;
    IGatedRedemptionQueueSharesWrapper.DepositMode internal depositMode;
    bool internal useDepositApprovals;
    bool internal useRedemptionApprovals;
    bool internal useTransferApprovals;
    address internal redemptionAsset;

    mapping(address => IGatedRedemptionQueueSharesWrapper.DepositQueue) internal depositAssetToQueue;
    IGatedRedemptionQueueSharesWrapper.RedemptionQueue internal redemptionQueue;
    IGatedRedemptionQueueSharesWrapper.RedemptionWindowConfig internal redemptionWindowConfig;

    mapping(address => bool) internal userToIsManager;

    // Per-user approvals for wrapped shares balance changes
    mapping(address => mapping(address => uint256)) internal userToAssetToDepositApproval;
    mapping(address => mapping(address => uint256)) internal userToRecipientToTransferApproval;
    mapping(address => uint256) internal userToRedemptionApproval;
}

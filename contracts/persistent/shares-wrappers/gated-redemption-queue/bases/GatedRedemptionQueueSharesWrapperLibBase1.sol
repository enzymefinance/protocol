// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GatedRedemptionQueueSharesWrapperLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base implementation for GatedRedemptionQueueSharesWrapperLib
/// @dev Each next base implementation inherits the previous base implementation,
/// e.g., `GatedRedemptionQueueSharesWrapperLibBase2 is GatedRedemptionQueueSharesWrapperLibBase1`
/// DO NOT EDIT CONTRACT.
abstract contract GatedRedemptionQueueSharesWrapperLibBase1 is ERC20, ReentrancyGuard {
    event DepositApproval(address indexed user, address indexed asset, uint256 amount);

    event Deposited(
        address indexed user,
        address indexed depositToken,
        uint256 depositTokenAmount,
        uint256 sharesReceived
    );

    event Initialized(address indexed vaultProxy);

    event Kicked(address indexed user, uint256 sharesAmount);

    event ManagerAdded(address indexed user);

    event ManagerRemoved(address indexed user);

    event Redeemed(address indexed user, uint256 sharesAmount);

    event RedemptionApproval(address indexed user, uint256 amount);

    event RedemptionAssetSet(address indexed asset);

    event RedemptionRequestAdded(address indexed user, uint256 sharesAmount);

    event RedemptionRequestRemoved(address indexed user);

    event RedemptionWindowConfigSet(
        uint256 firstWindowStart,
        uint256 frequency,
        uint256 duration,
        uint256 relativeSharesCap
    );

    event TransferApproval(address indexed sender, address indexed recipient, uint256 amount);

    event UseDepositApprovalsSet(bool useApprovals);

    event UseRedemptionApprovalsSet(bool useApprovals);

    event UseTransferApprovalsSet(bool useApprovals);

    struct RedemptionQueue {
        uint128 totalSharesPending;
        uint64 relativeSharesAllowed;
        uint64 relativeSharesCheckpointed;
        mapping(address => RedemptionRequest) userToRequest;
        address[] users;
    }

    struct RedemptionRequest {
        uint64 index;
        uint64 lastRedeemed;
        uint128 sharesPending;
    }

    struct RedemptionWindowConfig {
        uint64 firstWindowStart; // e.g., Jan 1, 2022; as timestamp
        uint32 frequency; // e.g., every 2 weeks; in seconds
        uint32 duration; // e.g., 1 week long; in seconds
        uint64 relativeSharesCap; // 100% is 1e18; e.g., 50% is 0.5e18
    }

    // Packing vaultProxy with useDepositApprovals makes deposits slightly cheaper
    address internal vaultProxy;
    bool internal useDepositApprovals;
    bool internal useRedemptionApprovals;
    bool internal useTransferApprovals;
    address internal redemptionAsset;

    RedemptionQueue internal redemptionQueue;
    RedemptionWindowConfig internal redemptionWindowConfig;

    mapping(address => bool) internal userToIsManager;

    // Per-user approvals for wrapped shares balance changes
    mapping(address => mapping(address => uint256)) internal userToAssetToDepositApproval;
    mapping(address => mapping(address => uint256)) internal userToRecipientToTransferApproval;
    mapping(address => uint256) internal userToRedemptionApproval;

    // Define init() shape so it is guaranteed for factory
    function init(
        address _vaultProxy,
        address[] calldata _managers,
        address _redemptionAsset,
        bool _useDepositApprovals,
        bool _useRedemptionApprovals,
        bool _useTransferApprovals,
        GatedRedemptionQueueSharesWrapperLibBase1.RedemptionWindowConfig calldata _windowConfig
    ) external virtual;
}

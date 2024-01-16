// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

/// @title IGatedRedemptionQueueSharesWrapper Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IGatedRedemptionQueueSharesWrapper {
    // REQUIRED; APPEND-ONLY

    // Required by: LibBase1

    enum DepositMode {
        Direct,
        Request
    }

    struct DepositQueue {
        mapping(address => DepositRequest) userToRequest;
        address[] users;
    }

    struct DepositRequest {
        uint64 index;
        uint128 assetAmount;
    }

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

    // Required by: Factory

    function init(
        address _vaultProxy,
        address[] calldata _managers,
        address _redemptionAsset,
        bool _useDepositApprovals,
        bool _useRedemptionApprovals,
        bool _useTransferApprovals,
        DepositMode _depositMode,
        RedemptionWindowConfig calldata _windowConfig
    ) external;
}

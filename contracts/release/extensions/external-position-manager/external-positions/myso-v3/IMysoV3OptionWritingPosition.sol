// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IMysoV3DataTypes} from "../../../../../external-interfaces/IMysoV3DataTypes.sol";
import {IExternalPosition} from "../../IExternalPosition.sol";

interface IMysoV3OptionWritingPosition is IExternalPosition {
    enum Actions {
        CreateEscrowByTakingQuote,
        CreateEscrowByStartingAuction,
        CloseAndSweepEscrows,
        WithdrawTokensFromEscrows,
        Sweep
    }

    struct CreateEscrowByTakingQuoteActionArgs {
        IMysoV3DataTypes.RFQInitialization rfqInitialization;
        address distPartner;
    }

    struct CreateEscrowByStartingAuctionActionArgs {
        IMysoV3DataTypes.AuctionInitialization auctionInitialization;
        address distPartner;
    }

    struct CloseAndSweepEscrowActionArgs {
        uint32[] escrowIdxs;
        // @dev Default is false; can be set to true to skip calling withdraw on escrow.
        // This is useful in cases where there was a full exercise, and the fund admin
        // wants to close the position before expiry, but a griefer donates to the escrow.
        // With the default flag, such donations would cause a revert due to calling
        // withdraw on the escrow prior to expiry.
        bool skipWithdrawFromEscrow;
    }

    struct WithdrawTokensFromEscrowsActionArgs {
        address[] escrows;
        address[] tokens;
    }

    struct SweepActionArgs {
        address[] tokens;
    }
}

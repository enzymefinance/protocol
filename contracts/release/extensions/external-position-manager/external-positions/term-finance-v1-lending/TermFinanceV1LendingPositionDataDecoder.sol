// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {ITermFinanceV1Auction} from "../../../../../external-interfaces/ITermFinanceV1Auction.sol";

pragma solidity 0.8.19;

/// @title TermFinanceV1LendingPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for TermFinanceV1LendingPosition payloads
abstract contract TermFinanceV1LendingPositionDataDecoder {
    /// @dev Helper to decode args used during the AddOrUpdateOffers action
    function __decodeAddOrUpdateOffersActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            ITermFinanceV1Auction termFinanceAuction_,
            bytes32[] memory offerIds_,
            bytes32[] memory offerPriceHashes_,
            int256[] memory amountsChange_
        )
    {
        return abi.decode(_actionArgs, (ITermFinanceV1Auction, bytes32[], bytes32[], int256[]));
    }

    /// @dev Helper to decode args used during the RemoveOffers action
    function __decodeRemoveOffersActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (ITermFinanceV1Auction termFinanceAuction_, bytes32[] memory offerIds_)
    {
        return abi.decode(_actionArgs, (ITermFinanceV1Auction, bytes32[]));
    }

    /// @dev Helper to decode args used during the Redeem action
    function __decodeRedeemActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (ITermFinanceV1Auction termFinanceAuction_, uint256 repoTokenAmount_)
    {
        return abi.decode(_actionArgs, (ITermFinanceV1Auction, uint256));
    }

    /// @dev Helper to decode args used during the Sweep action
    function __decodeSweepActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (ITermFinanceV1Auction[] memory termFinanceAuctions_)
    {
        return abi.decode(_actionArgs, (ITermFinanceV1Auction[]));
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title TermFinanceV1LendingPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a TermFinanceV1LendingPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered TermFinanceV1LendingPositionLibBaseXXX that inherits the previous base.
/// e.g., `TermFinanceV1LendingPositionLibBase2 is TermFinanceV1LendingPositionLibBase1`
abstract contract TermFinanceV1LendingPositionLibBase1 {
    event OfferAdded(address indexed termAuction, bytes32 indexed offerId);

    event OfferRemoved(address indexed termAuction, bytes32 indexed offerId);

    event TermAuctionAdded(address indexed termAuction);

    event TermAuctionRemoved(address indexed termAuction);

    address[] internal termAuctions;

    mapping(address termAuction => bytes32[] offerIds) internal termAuctionToOfferIds;
}

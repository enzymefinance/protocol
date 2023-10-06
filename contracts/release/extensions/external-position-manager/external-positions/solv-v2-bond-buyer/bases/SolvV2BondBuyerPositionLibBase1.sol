// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title SolvV2BondBuyerPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a SolvV2BondBuyerPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered SolvV2BondBuyerPositionLibBaseXXX that inherits the previous base.
/// e.g., `SolvV2BondBuyerPositionLibBase2 is SolvV2BondBuyerPositionLibBase1`
contract SolvV2BondBuyerPositionLibBase1 {
    event VoucherTokenIdAdded(address indexed voucher, uint32 indexed tokenId);

    event VoucherTokenIdRemoved(address indexed voucher, uint32 indexed tokenId);

    struct VoucherTokenId {
        address voucher;
        uint32 tokenId;
    }

    VoucherTokenId[] internal voucherTokenIds;
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title SolvV2ConvertibleBuyerPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a SolvV2ConvertibleBuyerPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered SolvV2ConvertibleBuyerPositionLibBaseXXX that inherits the previous base.
/// e.g., `SolvV2ConvertibleBuyerPositionLibBase2 is SolvV2ConvertibleBuyerPositionLibBase1`
contract SolvV2ConvertibleBuyerPositionLibBase1 {
    event SaleAdded(uint24 indexed saleId, address indexed currency);

    event SaleRemoved(uint24 indexed saleId, address indexed currency);

    event VoucherTokenIdAdded(address indexed voucher, uint32 indexed tokenId);

    event VoucherTokenIdRemoved(address indexed voucher, uint32 indexed tokenId);

    struct Sale {
        uint24 saleId;
        address currency;
    }

    struct VoucherTokenId {
        address voucher;
        uint32 tokenId;
    }

    Sale[] internal sales;

    VoucherTokenId[] internal voucherTokenIds;
}

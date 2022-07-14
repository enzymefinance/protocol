// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../release/interfaces/ISolvV2ConvertiblePool.sol";
import "../../../release/interfaces/ISolvV2ConvertibleVoucher.sol";

/// @title SolvV2ConvertibleIssuerPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a SolvV2ConvertibleIssuerPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered SolvV2ConvertibleIssuerPositionLibBaseXXX that inherits the previous base.
/// e.g., `SolvV2ConvertibleIssuerPositionLibBase2 is SolvV2ConvertibleIssuerPositionLibBase1`
contract SolvV2ConvertibleIssuerPositionLibBase1 {
    event IssuedVoucherAdded(address indexed voucher);

    event IssuedVoucherRemoved(address indexed voucher);

    event OfferAdded(uint24 indexed offerId);

    event OfferRemoved(uint24 indexed offerId);

    // Issued vouchers
    address[] internal issuedVouchers;

    // Created offers
    uint24[] internal offers;
}

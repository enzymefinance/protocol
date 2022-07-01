// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../persistent/external-positions/IExternalPosition.sol";
import "../../../../../persistent/external-positions/solv-v2-convertible-issuer/SolvV2ConvertibleIssuerPositionLibBase1.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ISolvV2ConvertibleIssuerPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISolvV2ConvertibleIssuerPosition is IExternalPosition {
    enum Actions {CreateOffer, Reconcile, Refund, RemoveOffer, Withdraw}

    function getOffers()
        external
        view
        returns (SolvV2ConvertibleIssuerPositionLibBase1.Offer[] memory offers_);
}

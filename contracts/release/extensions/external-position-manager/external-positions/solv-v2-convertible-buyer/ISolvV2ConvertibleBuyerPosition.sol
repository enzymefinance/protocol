// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../persistent/external-positions/solv-v2-convertible-buyer/SolvV2ConvertibleBuyerPositionLibBase1.sol";
import "../../../../../persistent/external-positions/IExternalPosition.sol";

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ISolvV2ConvertibleBuyerPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISolvV2ConvertibleBuyerPosition is IExternalPosition {
    enum Actions {
        BuyOffering,
        BuySaleByAmount,
        BuySaleByUnits,
        Claim,
        CreateSaleDecliningPrice,
        CreateSaleFixedPrice,
        Reconcile,
        RemoveSale
    }

    function getSales()
        external
        view
        returns (SolvV2ConvertibleBuyerPositionLibBase1.Sale[] memory sales_);
}

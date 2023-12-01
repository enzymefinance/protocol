// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1LendingPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1LendingPosition is IExternalPosition {
    enum Actions {
        AddOrUpdateOffers,
        RemoveOffers,
        Redeem,
        Sweep
    }

    function getOfferIdsFromTermAuction(address _termAuctionAddress)
        external
        view
        returns (bytes32[] memory offerIds_);

    function getTermAuctions() external view returns (address[] memory termAuctions_);
}

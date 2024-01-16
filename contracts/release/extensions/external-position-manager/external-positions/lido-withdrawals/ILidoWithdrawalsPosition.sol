// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity 0.8.19;

/// @title ILidoWithdrawalsPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ILidoWithdrawalsPosition is IExternalPosition {
    // REQUIRED; APPEND-ONLY

    // Required by: LibBase1

    struct Request {
        uint128 amount;
        uint128 id;
    }

    // ARBITRARY FOR VERSION

    enum Actions {
        RequestWithdrawals,
        ClaimWithdrawals
    }

    function getRequests() external view returns (Request[] memory requests_);
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity 0.8.19;

/// @title IStaderWithdrawalsPosition Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IStaderWithdrawalsPosition is IExternalPosition {
    enum Actions {
        RequestWithdrawal,
        ClaimWithdrawal
    }

    struct RequestWithdrawalActionArgs {
        uint256 ethXAmount;
    }

    struct ClaimWithdrawalActionArgs {
        uint256 requestId;
    }
}

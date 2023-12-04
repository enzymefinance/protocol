// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import {IExternalPosition} from "../../IExternalPosition.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IMapleLiquidityPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMapleLiquidityPosition is IExternalPosition {
    enum Actions {
        DEPRECATED_LendV1,
        DEPRECATED_LendAndStakeV1,
        DEPRECATED_IntendToRedeemV1,
        DEPRECATED_RedeemV1,
        DEPRECATED_StakeV1,
        DEPRECATED_UnstakeV1,
        DEPRECATED_UnstakeAndRedeemV1,
        DEPRECATED_ClaimInterestV1,
        DEPRECATED_ClaimRewardsV1,
        LendV2,
        RequestRedeemV2,
        RedeemV2,
        CancelRedeemV2
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../persistent/external-positions/IExternalPosition.sol";

pragma solidity 0.6.12;

/// @title IMapleLiquidityPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMapleLiquidityPosition is IExternalPosition {
    enum Actions {
        Lend,
        LendAndStake,
        IntendToRedeem,
        Redeem,
        Stake,
        Unstake,
        UnstakeAndRedeem,
        ClaimInterest,
        ClaimRewards
    }
}

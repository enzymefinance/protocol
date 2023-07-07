// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../persistent/external-positions/IExternalPosition.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IStakeWiseV3StakingPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IStakeWiseV3StakingPosition is IExternalPosition {
    enum Actions {
        Stake,
        Redeem,
        EnterExitQueue,
        ClaimExitedAssets
    }
}

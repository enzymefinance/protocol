// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IConvexCvxLockerV2 Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IConvexCvxLockerV2 {
    function getReward(address) external;

    function lock(
        address,
        uint256,
        uint256
    ) external;

    function lockedBalanceOf(address) external view returns (uint256);

    function processExpiredLocks(bool) external;

    function withdrawExpiredLocksTo(address) external;
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IConvexBaseRewardPool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IConvexBaseRewardPool {
    function balanceOf(address) external view returns (uint256);

    function extraRewards(uint256) external view returns (address);

    function extraRewardsLength() external view returns (uint256);

    function getReward() external returns (bool);

    function withdraw(uint256, bool) external;

    function withdrawAndUnwrap(uint256, bool) external returns (bool);
}

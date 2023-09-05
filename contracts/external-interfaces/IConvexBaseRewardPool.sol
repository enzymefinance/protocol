// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IConvexBaseRewardPool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IConvexBaseRewardPool {
    function balanceOf(address _account) external view returns (uint256 balance_);

    function extraRewards(uint256 _index) external view returns (address rewardPool_);

    function extraRewardsLength() external view returns (uint256 length_);

    function getReward() external returns (bool success_);

    function withdraw(uint256 _amount, bool _claim) external returns (bool success_);

    function withdrawAndUnwrap(uint256 _amount, bool _claim) external returns (bool success_);
}

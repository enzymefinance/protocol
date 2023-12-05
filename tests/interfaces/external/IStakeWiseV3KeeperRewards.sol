    // SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IStakeWiseV3KeeperRewards Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IStakeWiseV3KeeperRewards {
    struct RewardsUpdateParams {
        bytes32 rewardsRoot;
        uint256 avgRewardPerSecond;
        uint64 updateTimestamp;
        string rewardsIpfsHash;
        bytes signatures;
    }

    function rewardsDelay() external returns (uint256 rewardsDelay_);

    function updateRewards(RewardsUpdateParams calldata _params) external;
}

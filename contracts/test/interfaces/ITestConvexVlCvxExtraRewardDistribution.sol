// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestConvexVlCvxExtraRewardDistribution Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestConvexVlCvxExtraRewardDistribution {
    function addReward(address _token, uint256 _amount) external;

    function claimableRewards(address _account, address _token)
        external
        view
        returns (uint256 amount_);
}

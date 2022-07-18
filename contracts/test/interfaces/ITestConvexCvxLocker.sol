// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestConvexCvxLocker Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestConvexCvxLocker {
    function balanceOf(address _user) external view returns (uint256 amount_);

    function checkpointEpoch() external;

    function getReward(address _account, bool _stake) external;

    function lockedBalanceOf(address _user) external view returns (uint256 amount_);
}

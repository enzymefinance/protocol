// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

interface IMapleV2WithdrawalManager {
    function getWindowAtId(uint256 _cycleId) external view returns (uint256 windowStart_, uint256 windowEnd_);

    function exitCycleId(address _owner) external view returns (uint256 exitCycleId_);

    function lockedShares(address _owner) external view returns (uint256 lockedShares_);
}

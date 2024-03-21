// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IPendleV2YieldToken Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPendleV2YieldToken {
    function pyIndexCurrent() external returns (uint256 pyIndexCurrent_);

    function pyIndexStored() external view returns (uint256 pyIndexStored_);

    function doCacheIndexSameBlock() external view returns (bool doCache_);

    function pyIndexLastUpdatedBlock() external view returns (uint128 block_);
}

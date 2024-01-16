// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IPerformanceFee Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IPerformanceFee {
    // Does not use variable packing as `highWaterMark` will often be read without reading `rate`,
    // `rate` will never be updated after deployment, and each is set at a different time
    struct FeeInfo {
        uint256 rate;
        uint256 highWaterMark;
    }
}

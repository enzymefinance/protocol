// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IManagementFee Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IManagementFee {
    struct FeeInfo {
        // The scaled rate representing 99.99% is under 10^28,
        // thus `uint128 scaledPerSecondRate` is sufficient for any reasonable fee rate
        uint128 scaledPerSecondRate;
        uint128 lastSettled;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ISynthetix Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ISynthetix {
    function exchangeOnBehalfWithTracking(
        address,
        bytes32,
        uint256,
        bytes32,
        address,
        bytes32
    ) external returns (uint256);
}

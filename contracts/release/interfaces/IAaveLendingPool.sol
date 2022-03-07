// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IAaveLendingPool interface
/// @author Enzyme Council <security@enzyme.finance>
interface IAaveLendingPool {
    function borrow(
        address,
        uint256,
        uint256,
        uint16,
        address
    ) external;

    function deposit(
        address,
        uint256,
        address,
        uint16
    ) external;

    function repay(
        address,
        uint256,
        uint256,
        address
    ) external returns (uint256);

    function withdraw(
        address,
        uint256,
        address
    ) external returns (uint256);
}

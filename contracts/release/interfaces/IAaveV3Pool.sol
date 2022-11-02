// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IAaveV3Pool interface
/// @author Enzyme Council <security@enzyme.finance>
interface IAaveV3Pool {
    function supply(
        address _underlying,
        uint256 _amount,
        address _to,
        uint16 _referralCode
    ) external;

    function withdraw(
        address _underlying,
        uint256 _amount,
        address _to
    ) external;
}

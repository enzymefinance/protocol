// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveLiquidityGaugeV2 interface
/// @author Enzyme Council <security@enzyme.finance>
interface ICurveLiquidityGaugeV2 {
    function deposit(uint256, address) external;

    function withdraw(uint256) external;
}

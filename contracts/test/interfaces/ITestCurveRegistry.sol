// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestCurveRegistry Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestCurveRegistry {
    function get_coins(address _pool) external view returns (address[8] memory coins_);

    function get_lp_token(address _pool) external view returns (address token_);
}

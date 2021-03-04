// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveStableSwapSteth interface
/// @author Enzyme Council <security@enzyme.finance>
interface ICurveStableSwapSteth {
    function add_liquidity(uint256[2] calldata, uint256) external payable returns (uint256);

    function remove_liquidity(uint256, uint256[2] calldata) external returns (uint256[2] memory);

    function remove_liquidity_one_coin(
        uint256,
        int128,
        uint256
    ) external returns (uint256);
}

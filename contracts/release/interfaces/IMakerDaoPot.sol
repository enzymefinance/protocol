// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @notice Limited interface for Maker DSR's Pot contract
/// @dev See DSR integration guide: https://github.com/makerdao/developerguides/blob/master/dai/dsr-integration-guide/dsr-integration-guide-01.md
interface IMakerDaoPot {
    function chi() external view returns (uint256);

    function rho() external view returns (uint256);

    function drip() external returns (uint256);
}

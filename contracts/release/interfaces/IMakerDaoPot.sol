// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @notice Limited interface for Maker DSR's Pot contract
/// @dev See DSR integration guide: https://github.com/makerdao/developerguides/blob/master/dai/dsr-integration-guide/dsr-integration-guide-01.md
interface IMakerDaoPot {
    function chi() external view returns (uint256);

    function rho() external view returns (uint256);

    function drip() external returns (uint256);
}

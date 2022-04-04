// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ILiquityTroveManager Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for our interactions with Liquity Trove Mangager contract
interface ILiquityTroveManager {
    function getTroveColl(address) external view returns (uint256);

    function getTroveDebt(address) external view returns (uint256);
}

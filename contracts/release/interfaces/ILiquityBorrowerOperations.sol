// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ILiquityBorrowerOperations Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for our interactions with LiquityBorrowerOperation contract
interface ILiquityBorrowerOperations {
    function addColl(address, address) external payable;

    function closeTrove() external;

    function openTrove(
        uint256,
        uint256,
        address,
        address
    ) external payable;

    function repayLUSD(
        uint256,
        address,
        address
    ) external;

    function withdrawColl(
        uint256,
        address,
        address
    ) external;

    function withdrawLUSD(
        uint256,
        uint256,
        address,
        address
    ) external;
}

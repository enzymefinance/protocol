// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestTheGraphStaking Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for The Graph Staking contract
interface ITestTheGraphStaking {
    function delegationTaxPercentage() external view returns (uint32);

    function getDelegation(address, address)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );
}

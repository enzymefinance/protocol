// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITheGraphStaking Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITheGraphStaking {
    function delegate(address, uint256) external returns (uint256);

    function delegationPools(address)
        external
        view
        returns (
            uint32,
            uint32,
            uint32,
            uint256,
            uint256,
            uint256
        );

    function getDelegation(address, address)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function undelegate(address, uint256) external returns (uint256);

    function withdrawDelegated(address, address) external returns (uint256);
}

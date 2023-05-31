// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IVaultCore interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for getters of core vault storage
/// @dev DO NOT EDIT CONTRACT
interface IVaultCore {
    function getAccessor() external view returns (address accessor_);

    function getCreator() external view returns (address creator_);

    function getMigrator() external view returns (address migrator_);

    function getOwner() external view returns (address owner_);
}

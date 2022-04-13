// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IGlobalConfigVaultAccessGetter Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Vault access getters related to VaultLib from v2 to present
interface IGlobalConfigVaultAccessGetter {
    function getAccessor() external view returns (address);
}

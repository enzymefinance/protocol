// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IYearnVaultV2Registry Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for our interactions with the Yearn Vault V2 registry
interface IYearnVaultV2Registry {
    function numVaults(address) external view returns (uint256);

    function vaults(address, uint256) external view returns (address);
}

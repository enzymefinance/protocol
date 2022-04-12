// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title GlobalConfigProxyConstants Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Constant values used in GlobalConfig proxy-related contracts
abstract contract GlobalConfigProxyConstants {
    // `bytes32(keccak256('mln.proxiable.globalConfigLib'))`
    bytes32
        internal constant EIP_1822_PROXIABLE_UUID = 0xf25d88d51901d7fabc9924b03f4c2fe4300e6fe1aae4b5134c0a90b68cd8e81c;
    // `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`
    bytes32
        internal constant EIP_1967_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
}

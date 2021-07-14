// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ProtocolFeeProxyConstants Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Constant values used in ProtocolFee proxy-related contracts
abstract contract ProtocolFeeProxyConstants {
    // `bytes32(keccak256('mln.proxiable.protocolFeeReserveLib'))`
    bytes32
        internal constant EIP_1822_PROXIABLE_UUID = 0xbc966524590ce702cc9340e80d86ea9095afa6b8eecbb5d6213f576332239181;
    // `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`
    bytes32
        internal constant EIP_1967_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
}

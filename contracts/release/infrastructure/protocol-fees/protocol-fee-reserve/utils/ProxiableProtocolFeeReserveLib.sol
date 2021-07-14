// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "./ProtocolFeeProxyConstants.sol";

pragma solidity 0.6.12;

/// @title ProxiableProtocolFeeReserveLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract that defines the upgrade behavior for ProtocolFeeReserveLib instances
/// @dev The recommended implementation of the target of a proxy according to EIP-1822 and EIP-1967
/// See: https://eips.ethereum.org/EIPS/eip-1822
/// See: https://eips.ethereum.org/EIPS/eip-1967
abstract contract ProxiableProtocolFeeReserveLib is ProtocolFeeProxyConstants {
    /// @dev Updates the target of the proxy to be the contract at _nextProtocolFeeReserveLib
    function __updateCodeAddress(address _nextProtocolFeeReserveLib) internal {
        require(
            ProxiableProtocolFeeReserveLib(_nextProtocolFeeReserveLib).proxiableUUID() ==
                bytes32(EIP_1822_PROXIABLE_UUID),
            "__updateCodeAddress: _nextProtocolFeeReserveLib not compatible"
        );
        assembly {
            sstore(EIP_1967_SLOT, _nextProtocolFeeReserveLib)
        }
    }

    /// @notice Returns a unique bytes32 hash for ProtocolFeeReserveLib instances
    /// @return uuid_ The bytes32 hash representing the UUID
    function proxiableUUID() public pure returns (bytes32 uuid_) {
        return EIP_1822_PROXIABLE_UUID;
    }
}

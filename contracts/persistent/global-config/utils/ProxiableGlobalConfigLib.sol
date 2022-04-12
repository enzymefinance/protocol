// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./GlobalConfigProxyConstants.sol";

/// @title ProxiableGlobalConfigLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract that defines the upgrade behavior for GlobalConfigLib instances
/// @dev The recommended implementation of the target of a proxy according to EIP-1822 and EIP-1967
/// See: https://eips.ethereum.org/EIPS/eip-1822
/// See: https://eips.ethereum.org/EIPS/eip-1967
abstract contract ProxiableGlobalConfigLib is GlobalConfigProxyConstants {
    /// @dev Updates the target of the proxy to be the contract at _nextGlobalConfigLib
    function __updateCodeAddress(address _nextGlobalConfigLib) internal {
        require(
            ProxiableGlobalConfigLib(_nextGlobalConfigLib).proxiableUUID() ==
                bytes32(EIP_1822_PROXIABLE_UUID),
            "__updateCodeAddress: _nextGlobalConfigLib not compatible"
        );
        assembly {
            sstore(EIP_1967_SLOT, _nextGlobalConfigLib)
        }
    }

    /// @notice Returns a unique bytes32 hash for GlobalConfigLib instances
    /// @return uuid_ The bytes32 hash representing the UUID
    function proxiableUUID() public pure returns (bytes32 uuid_) {
        return EIP_1822_PROXIABLE_UUID;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ProxiableGlobalConfigLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract that defines the upgrade behavior for GlobalConfigLib instances
/// @dev The recommended implementation of the target of a proxy according to EIP-1822 and EIP-1967
/// Code position in storage is `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`,
/// which is "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc".
abstract contract ProxiableGlobalConfigLib {
    /// @dev Updates the target of the proxy to be the contract at _nextGlobalConfigLib
    function __updateCodeAddress(address _nextGlobalConfigLib) internal {
        require(
            bytes32(0xf25d88d51901d7fabc9924b03f4c2fe4300e6fe1aae4b5134c0a90b68cd8e81c) ==
                ProxiableGlobalConfigLib(_nextGlobalConfigLib).proxiableUUID(),
            "__updateCodeAddress: _nextGlobalConfigLib not compatible"
        );
        assembly {
            sstore(
                0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc,
                _nextGlobalConfigLib
            )
        }
    }

    /// @notice Returns a unique bytes32 hash for GlobalConfigLib instances
    /// @return uuid_ The bytes32 hash representing the UUID
    /// @dev The UUID is `bytes32(keccak256('mln.proxiable.globalConfigLib'))`
    function proxiableUUID() public pure returns (bytes32 uuid_) {
        return 0xf25d88d51901d7fabc9924b03f4c2fe4300e6fe1aae4b5134c0a90b68cd8e81c;
    }
}

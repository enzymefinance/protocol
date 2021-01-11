// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ProxiableVaultLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract that defines the upgrade behavior for VaultLib instances
/// @dev The recommended implementation of the target of a proxy according to EIP-1822 and EIP-1967
/// Code position in storage is `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`,
/// which is "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc".
abstract contract ProxiableVaultLib {
    /// @dev Updates the target of the proxy to be the contract at _nextVaultLib
    function __updateCodeAddress(address _nextVaultLib) internal {
        require(
            bytes32(0x027b9570e9fedc1a80b937ae9a06861e5faef3992491af30b684a64b3fbec7a5) ==
                ProxiableVaultLib(_nextVaultLib).proxiableUUID(),
            "__updateCodeAddress: _nextVaultLib not compatible"
        );
        assembly {
            // solium-disable-line
            sstore(
                0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc,
                _nextVaultLib
            )
        }
    }

    /// @notice Returns a unique bytes32 hash for VaultLib instances
    /// @return uuid_ The bytes32 hash representing the UUID
    /// @dev The UUID is `bytes32(keccak256('mln.proxiable.vaultlib'))`
    function proxiableUUID() public pure returns (bytes32 uuid_) {
        return 0x027b9570e9fedc1a80b937ae9a06861e5faef3992491af30b684a64b3fbec7a5;
    }
}

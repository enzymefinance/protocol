// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @dev The recommended implementation of the target of a proxy according to EIP-1822
/// See: https://eips.ethereum.org/EIPS/eip-1822
/// Code position in storage is `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`,
/// which is "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc".
abstract contract Proxiable {
    /// @dev Updates the target of the proxy to be the contract at _nextAddress
    function __updateCodeAddress(address _nextAddress) internal {
        require(
            bytes32(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc) ==
                Proxiable(_nextAddress).proxiableUUID(),
            "Not compatible"
        );
        assembly {
            // solium-disable-line
            sstore(
                0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc,
                _nextAddress
            )
        }
    }

    /// @notice Returns the bytes32 hash of the storage slot specified by EIP-1967
    /// @return uuid_ The UUID corresponding to the storage slot specified by EIP-1967
    /// @dev Used to validate that the library set in __updateCodeAddress() implements Proxiable
    function proxiableUUID() public pure returns (bytes32 uuid_) {
        return 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @dev The recommended implementation of the target of a proxy according to EIP-1822
/// See: https://eips.ethereum.org/EIPS/eip-1822
contract Proxiable {
    // Code position in storage is `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`,
    // which is "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc".

    function __updateCodeAddress(address _newAddress) internal {
        require(
            bytes32(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc) ==
                Proxiable(_newAddress).proxiableUUID(),
            "Not compatible"
        );
        assembly {
            // solium-disable-line
            sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, _newAddress)
        }
    }

    // TODO: implement this differently?
    function proxiableUUID() public pure returns (bytes32) {
        return 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    }
}

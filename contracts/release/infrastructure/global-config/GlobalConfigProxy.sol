// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./utils/ProxiableGlobalConfigLib.sol";

/// @title GlobalConfigProxy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A proxy contract for global configuration, slightly modified from EIP-1822
/// @dev Adapted from the recommended implementation of a Proxy in EIP-1822, updated for solc 0.6.12,
/// and using the EIP-1967 storage slot for the proxiable implementation.
/// i.e., `bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)`, which is
/// "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
/// See: https://eips.ethereum.org/EIPS/eip-1822
contract GlobalConfigProxy {
    constructor(bytes memory _constructData, address _globalConfigLib) public {
        // "0xf25d88d51901d7fabc9924b03f4c2fe4300e6fe1aae4b5134c0a90b68cd8e81c" corresponds to
        // `bytes32(keccak256('mln.proxiable.globalConfigLib'))`
        require(
            bytes32(0xf25d88d51901d7fabc9924b03f4c2fe4300e6fe1aae4b5134c0a90b68cd8e81c) ==
                ProxiableGlobalConfigLib(_globalConfigLib).proxiableUUID(),
            "constructor: _globalConfigLib not compatible"
        );

        assembly {
            sstore(
                0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc,
                _globalConfigLib
            )
        }

        (bool success, bytes memory returnData) = _globalConfigLib.delegatecall(_constructData);
        require(success, string(returnData));
    }

    fallback() external payable {
        assembly {
            let contractLogic := sload(
                0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
            )
            calldatacopy(0x0, 0x0, calldatasize())
            let success := delegatecall(
                sub(gas(), 10000),
                contractLogic,
                0x0,
                calldatasize(),
                0,
                0
            )
            let retSz := returndatasize()
            returndatacopy(0, 0, retSz)
            switch success
                case 0 {
                    revert(0, retSz)
                }
                default {
                    return(0, retSz)
                }
        }
    }
}

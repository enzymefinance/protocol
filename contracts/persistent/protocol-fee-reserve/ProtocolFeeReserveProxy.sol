// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./utils/ProtocolFeeProxyConstants.sol";
import "./utils/ProxiableProtocolFeeReserveLib.sol";

/// @title ProtocolFeeReserveProxy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A proxy contract for a protocol fee reserve, slightly modified from EIP-1822
/// @dev Adapted from the recommended implementation of a Proxy in EIP-1822, updated for solc 0.6.12,
/// and using the EIP-1967 storage slot for the proxiable implementation.
/// See: https://eips.ethereum.org/EIPS/eip-1822
/// See: https://eips.ethereum.org/EIPS/eip-1967
contract ProtocolFeeReserveProxy is ProtocolFeeProxyConstants {
    constructor(bytes memory _constructData, address _protocolFeeReserveLib) public {
        // Validate constants
        require(
            EIP_1822_PROXIABLE_UUID == bytes32(keccak256("mln.proxiable.protocolFeeReserveLib")),
            "constructor: Invalid EIP_1822_PROXIABLE_UUID"
        );
        require(
            EIP_1967_SLOT == bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1),
            "constructor: Invalid EIP_1967_SLOT"
        );

        require(
            ProxiableProtocolFeeReserveLib(_protocolFeeReserveLib).proxiableUUID() == EIP_1822_PROXIABLE_UUID,
            "constructor: _protocolFeeReserveLib not compatible"
        );

        assembly {
            sstore(EIP_1967_SLOT, _protocolFeeReserveLib)
        }

        (bool success, bytes memory returnData) = _protocolFeeReserveLib.delegatecall(_constructData);
        require(success, string(returnData));
    }

    fallback() external payable {
        assembly {
            let contractLogic := sload(EIP_1967_SLOT)
            calldatacopy(0x0, 0x0, calldatasize())
            let success := delegatecall(sub(gas(), 10000), contractLogic, 0x0, calldatasize(), 0, 0)
            let retSz := returndatasize()
            returndatacopy(0, 0, retSz)
            switch success
            case 0 { revert(0, retSz) }
            default { return(0, retSz) }
        }
    }
}

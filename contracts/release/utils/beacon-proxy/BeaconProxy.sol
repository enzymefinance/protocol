// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./IBeacon.sol";

/// @title BeaconProxy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A proxy contract that uses the beacon pattern for instant upgrades
contract BeaconProxy {
    address private immutable BEACON;

    constructor(bytes memory _constructData, address _beacon) public {
        BEACON = _beacon;

        (bool success, bytes memory returnData) = IBeacon(_beacon).getCanonicalLib().delegatecall(
            _constructData
        );
        require(success, string(returnData));
    }

    // solhint-disable-next-line no-complex-fallback
    fallback() external payable {
        address contractLogic = IBeacon(BEACON).getCanonicalLib();
        assembly {
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

    receive() external payable {}
}

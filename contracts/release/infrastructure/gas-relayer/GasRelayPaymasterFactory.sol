// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IDispatcher} from "../../../persistent/dispatcher/IDispatcher.sol";
import {BeaconProxyFactory} from "../../../utils/0.8.19/deprecated/beacon-proxy/BeaconProxyFactory.sol";

/// @title GasRelayPaymasterFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Factory contract that deploys paymaster proxies for gas relaying
contract GasRelayPaymasterFactory is BeaconProxyFactory {
    address private immutable DISPATCHER;

    constructor(address _dispatcher, address _paymasterLib) BeaconProxyFactory(_paymasterLib) {
        DISPATCHER = _dispatcher;
    }

    /// @notice Gets the contract owner
    /// @return owner_ The contract owner
    function getOwner() public view override returns (address owner_) {
        return IDispatcher(getDispatcher()).getOwner();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `DISPATCHER` variable
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() public view returns (address dispatcher_) {
        return DISPATCHER;
    }
}

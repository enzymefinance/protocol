// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {BeaconProxy} from "openzeppelin-solc-0.8/proxy/beacon/BeaconProxy.sol";
import {IDispatcher} from "../../../persistent/dispatcher/IDispatcher.sol";
import {IDispatcherOwnedBeacon} from "./IDispatcherOwnedBeacon.sol";

/// @title DispatcherOwnedBeacon Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A Beacon that is owned by the Enzyme Dispatcher's owner
contract DispatcherOwnedBeacon is IDispatcherOwnedBeacon {
    event ImplementationSet(address implementation);

    event ProxyDeployed(address proxy);

    IDispatcher internal immutable DISPATCHER_CONTRACT;

    address public override implementation;

    modifier onlyOwner() {
        require(msg.sender == getOwner(), "onlyOwner");
        _;
    }

    constructor(address _dispatcher, address _implementation) {
        DISPATCHER_CONTRACT = IDispatcher(_dispatcher);
        implementation = _implementation;
    }

    // EXTERNAL

    /// @notice Sets the beacon implementation contract
    /// @param _nextImplementation The next implementation contract
    function setImplementation(address _nextImplementation) external override onlyOwner {
        implementation = _nextImplementation;

        emit ImplementationSet(_nextImplementation);
    }

    // PUBLIC

    /// @notice Gets the contract owner
    /// @return owner_ The contract owner
    function getOwner() public view override returns (address owner_) {
        return DISPATCHER_CONTRACT.getOwner();
    }

    // INTERNAL

    /// @dev Helper to deploy a proxy instance
    function __deployProxy(bytes memory _constructData) internal returns (address proxy_) {
        proxy_ = address(new BeaconProxy({beacon: address(this), data: _constructData}));

        emit ProxyDeployed(proxy_);

        return proxy_;
    }
}

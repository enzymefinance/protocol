// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../persistent/dispatcher/IDispatcher.sol";

/// @title DispatcherOwnerMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract that defers ownership to the owner of Dispatcher
abstract contract DispatcherOwnerMixin {
    address internal immutable DISPATCHER;

    modifier onlyDispatcherOwner() {
        require(
            msg.sender == getOwner(),
            "onlyDispatcherOwner: Only the Dispatcher owner can call this function"
        );
        _;
    }

    constructor(address _dispatcher) public {
        DISPATCHER = _dispatcher;
    }

    function getOwner() public view returns (address) {
        return IDispatcher(DISPATCHER).getOwner();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getDispatcher() external view returns (address) {
        return DISPATCHER;
    }
}

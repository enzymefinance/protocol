// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../dispatcher/IDispatcher.sol";
import "../utils/ProxiableProtocolFeeReserveLib.sol";

/// @title ProtocolFeeReserveLibBaseCore Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The core implementation of ProtocolFeeReserveLib
/// @dev To be inherited by the first ProtocolFeeReserveLibBase implementation only.
/// DO NOT EDIT CONTRACT.
abstract contract ProtocolFeeReserveLibBaseCore is ProxiableProtocolFeeReserveLib {
    event ProtocolFeeReserveLibSet(address nextProtocolFeeReserveLib);

    address private dispatcher;

    modifier onlyDispatcherOwner() {
        require(
            msg.sender == IDispatcher(getDispatcher()).getOwner(),
            "Only the Dispatcher owner can call this function"
        );

        _;
    }

    /// @notice Initializes the ProtocolFeeReserveProxy with core configuration
    /// @param _dispatcher The Dispatcher contract
    /// @dev Serves as a pseudo-constructor
    function init(address _dispatcher) external {
        require(getDispatcher() == address(0), "init: Proxy already initialized");

        dispatcher = _dispatcher;

        emit ProtocolFeeReserveLibSet(getProtocolFeeReserveLib());
    }

    /// @notice Sets the ProtocolFeeReserveLib target for the ProtocolFeeReserveProxy
    /// @param _nextProtocolFeeReserveLib The address to set as the ProtocolFeeReserveLib
    /// @dev This function is absolutely critical. __updateCodeAddress() validates that the
    /// target is a valid Proxiable contract instance.
    /// Does not block _nextProtocolFeeReserveLib from being the same as the current ProtocolFeeReserveLib
    function setProtocolFeeReserveLib(address _nextProtocolFeeReserveLib)
        external
        onlyDispatcherOwner
    {
        __updateCodeAddress(_nextProtocolFeeReserveLib);

        emit ProtocolFeeReserveLibSet(_nextProtocolFeeReserveLib);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `dispatcher` variable
    /// @return dispatcher_ The `dispatcher` variable value
    function getDispatcher() public view returns (address dispatcher_) {
        return dispatcher;
    }

    /// @notice Gets the ProtocolFeeReserveLib target for the ProtocolFeeReserveProxy
    /// @return protocolFeeReserveLib_ The address of the ProtocolFeeReserveLib target
    function getProtocolFeeReserveLib() public view returns (address protocolFeeReserveLib_) {
        assembly {
            protocolFeeReserveLib_ := sload(EIP_1967_SLOT)
        }

        return protocolFeeReserveLib_;
    }
}

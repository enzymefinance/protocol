// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../persistent/dispatcher/IDispatcher.sol";
import "../utils/ProxiableGlobalConfigLib.sol";

/// @title GlobalConfigLibBaseCore Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The core implementation of GlobalConfigLib
/// @dev To be inherited by the first GlobalConfigLibBase implementation only.
/// DO NOT EDIT CONTRACT.
abstract contract GlobalConfigLibBaseCore is ProxiableGlobalConfigLib {
    event GlobalConfigLibSet(address nextGlobalConfigLib);

    address internal dispatcher;

    modifier onlyDispatcherOwner {
        require(
            msg.sender == IDispatcher(dispatcher).getOwner(),
            "Only the Dispatcher owner can call this function"
        );

        _;
    }

    /// @notice Initializes the GlobalConfigProxy with core configuration
    /// @param _dispatcher The Dispatcher contract
    /// @dev Serves as a pseudo-constructor
    function init(address _dispatcher) external {
        require(dispatcher == address(0), "init: Proxy already initialized");

        dispatcher = _dispatcher;

        emit GlobalConfigLibSet(getGlobalConfigLib());
    }

    /// @notice Gets the GlobalConfigLib target for the GlobalConfigProxy
    /// @return globalConfigLib_ The address of the GlobalConfigLib target
    function getGlobalConfigLib() public view returns (address globalConfigLib_) {
        assembly {
            globalConfigLib_ := sload(
                0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
            )
        }

        return globalConfigLib_;
    }

    /// @notice Sets the GlobalConfigLib target for the GlobalConfigProxy
    /// @param _nextGlobalConfigLib The address to set as the GlobalConfigLib
    /// @dev This function is absolutely critical. __updateCodeAddress() validates that the
    /// target is a valid Proxiable contract instance.
    /// Does not block _nextGlobalConfigLib from being the same as the current GlobalConfigLib
    function setGlobalConfigLib(address _nextGlobalConfigLib) external onlyDispatcherOwner {
        __updateCodeAddress(_nextGlobalConfigLib);

        emit GlobalConfigLibSet(_nextGlobalConfigLib);
    }
}

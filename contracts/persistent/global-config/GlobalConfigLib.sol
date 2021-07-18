// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./bases/GlobalConfigLibBaseCore.sol";

/// @title GlobalConfigLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The proxiable library contract for GlobalConfigProxy
contract GlobalConfigLib is GlobalConfigLibBaseCore {
    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `dispatcher` variable
    /// @return dispatcher_ The `dispatcher` variable value
    function getDispatcher() external view returns (address dispatcher_) {
        return dispatcher;
    }
}

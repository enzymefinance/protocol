// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/interfaces/IMapleV2Globals.sol";

/// @title MockMapleV2GlobalsIntegratee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An integratee that simulates interactions with Maple v2 Globals
contract MockMapleV2GlobalsIntegratee is IMapleV2Globals {
    function isFactory(bytes32, address) external view override returns (bool isFactory_) {
        return true;
    }
}

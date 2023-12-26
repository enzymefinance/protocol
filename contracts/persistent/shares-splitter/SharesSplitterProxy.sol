// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {NonUpgradableProxy} from "../../utils/0.6.12/NonUpgradableProxy.sol";

/// @title SharesSplitterProxy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A proxy contract for all SharesSplitterProxy instances
contract SharesSplitterProxy is NonUpgradableProxy {
    constructor(bytes memory _constructData, address _sharesSplitterLib)
        public
        NonUpgradableProxy(_constructData, _sharesSplitterLib)
    {}
}

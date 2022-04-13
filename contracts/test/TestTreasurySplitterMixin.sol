// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../persistent/shares-splitter/TreasurySplitterMixin.sol";

/// @title TestTreasurySplitterMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test implementation of TreasurySplitterMixin
contract TestTreasurySplitterMixin is TreasurySplitterMixin {
    function setSplitRatio(address[] memory _users, uint256[] memory _splitPercentages) external {
        __setSplitRatio(_users, _splitPercentages);
    }
}

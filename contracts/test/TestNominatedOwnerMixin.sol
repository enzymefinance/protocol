// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/utils/NominatedOwnerMixin.sol";

/// @title TestNominatedOwnerMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test implementation of NominatedOwnerMixin
contract TestNominatedOwnerMixin is NominatedOwnerMixin {
    function setOwner(address _nextOwner) external {
        return __setOwner(_nextOwner);
    }
}

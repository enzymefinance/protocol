// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestLiquitySortedTroves Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestLiquitySortedTroves {
    function findInsertPosition(
        uint256 _NCIR,
        address _prevId,
        address _nextId
    ) external view returns (address upperHint_, address lowerHint_);
}

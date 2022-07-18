// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestTheGraphStaking Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestTheGraphStaking {
    function delegationTaxPercentage() external view returns (uint32 taxPercentage_);

    function getDelegation(address _indexer, address _delegator)
        external
        view
        returns (
            uint256 shares_,
            uint256 tokensLocked_,
            uint256 tokensLockedUntil_
        );
}

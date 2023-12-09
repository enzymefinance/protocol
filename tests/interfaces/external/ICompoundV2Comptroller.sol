// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ICompoundV2Comptroller Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for interactions with Compound Comptroller
interface ICompoundV2Comptroller {
    function getCompAddress() external view returns (address comp_);
}

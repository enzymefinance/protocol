// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IAlphaHomoraV1Bank interface
/// @author Enzyme Council <security@enzyme.finance>
interface IAlphaHomoraV1Bank {
    function deposit() external payable;

    function totalETH() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function withdraw(uint256) external;
}

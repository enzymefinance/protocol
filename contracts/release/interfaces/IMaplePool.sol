// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IMaplePool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMaplePool {
    function deposit(uint256) external;

    function increaseCustodyAllowance(address, uint256) external;

    function intendToWithdraw() external;

    function liquidityAsset() external view returns (address);

    function recognizableLossesOf(address) external returns (uint256);

    function withdraw(uint256) external;

    function withdrawFunds() external;

    function withdrawableFundsOf(address) external returns (uint256);
}

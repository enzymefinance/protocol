// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title WETH Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IWETH {
    function deposit() external payable;

    function withdraw(uint256) external;
}

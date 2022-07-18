// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestStandardToken Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestStandardToken {
    event Approval(address indexed owner, address indexed spender, uint256 value);

    event Transfer(address indexed from, address indexed to, uint256 value);

    function allowance(address _owner, address _spender) external view returns (uint256 amount_);

    function approve(address _spender, uint256 _amount) external returns (bool success_);

    function balanceOf(address _account) external view returns (uint256 balance_);

    function decimals() external view returns (uint8 decimals_);

    function symbol() external view returns (string memory symbol_);

    function totalSupply() external view returns (uint256 supply_);

    function transfer(address _recipient, uint256 _amount) external returns (bool success_);

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) external returns (bool success_);
}

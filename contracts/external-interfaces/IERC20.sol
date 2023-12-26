// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

/// @title IERC20 Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IERC20 {
    // IERC20 - strict

    function allowance(address _owner, address _spender) external view returns (uint256 allowance_);

    function approve(address _spender, uint256 _value) external returns (bool approve_);

    function balanceOf(address _account) external view returns (uint256 balanceOf_);

    function totalSupply() external view returns (uint256 totalSupply_);

    function transfer(address _to, uint256 _value) external returns (bool transfer_);

    function transferFrom(address _from, address _to, uint256 _value) external returns (bool transferFrom_);

    // IERC20 - typical

    function decimals() external view returns (uint8 decimals_);

    function name() external view returns (string memory name_);

    function symbol() external view returns (string memory symbol_);
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ITestCERC20 Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestCERC20 is IERC20 {
    function accrueInterest() external returns (uint256 amount_);

    function borrow(uint256 _borrowAmount) external returns (uint256 amount_);

    function borrowBalanceStored(address _account) external view returns (uint256 amount_);

    function decimals() external view returns (uint8 decimals_);

    function mint(uint256 _mintAmount) external returns (uint256 amount_);

    function redeem(uint256 _redeemAmount) external returns (uint256 amount_);

    function repayBorrow(uint256 _repayAmount) external returns (uint256 amount_);

    function exchangeRateStored() external view returns (uint256 rate_);

    function underlying() external returns (address asset_);
}

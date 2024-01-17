// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;

import {IERC20} from "./IERC20.sol";

interface ICompoundV2CERC20 is IERC20 {
    function accrueInterest() external returns (uint256 interest_);

    function borrow(uint256 _borrowAmount) external returns (uint256 status_);

    function borrowBalanceStored(address _account) external view returns (uint256 balance_);

    function redeem(uint256 _redeemAmount) external returns (uint256 status_);

    function repayBorrow(uint256 _repayAmouny) external returns (uint256 status_);

    function exchangeRateStored() external view returns (uint256 exchangeRate_);

    function underlying() external returns (address underlying_);
}

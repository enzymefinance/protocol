// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IERC20} from "./IERC20.sol";

/// @title ICERC20 Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for interactions with Compound V2 tokens (cTokens)
interface ICERC20 is IERC20 {
    function accrueInterest() external returns (uint256 interest_);

    function borrow(uint256 _borrowAmount) external returns (uint256 status_);

    function borrowBalanceStored(address _account) external view returns (uint256 balance_);

    function redeem(uint256 _redeemAmount) external returns (uint256 status_);

    function exchangeRateStored() external view returns (uint256 exchangeRate_);

    function underlying() external returns (address underlying_);
}

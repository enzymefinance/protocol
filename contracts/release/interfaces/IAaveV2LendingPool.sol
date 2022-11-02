// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IAaveV2LendingPool interface
/// @author Enzyme Council <security@enzyme.finance>
interface IAaveV2LendingPool {
    function borrow(
        address _underlying,
        uint256 _amount,
        uint256 _rateMode,
        uint16 _referralCode,
        address _to
    ) external;

    function deposit(
        address _underlying,
        uint256 _amount,
        address _to,
        uint16 _referralCode
    ) external;

    function repay(
        address _underlying,
        uint256 _amount,
        uint256 _rateMode,
        address _to
    ) external returns (uint256 actualAmount_);

    function withdraw(
        address _underlying,
        uint256 _amount,
        address _to
    ) external returns (uint256 actualAmount_);
}

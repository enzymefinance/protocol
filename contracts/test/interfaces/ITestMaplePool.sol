// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestMaplePool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestMaplePool {
    function custodyAllowance(address _user, address _custodian)
        external
        view
        returns (uint256 allowance_);

    function deposit(uint256 _amount) external;

    function lockupPeriod() external view returns (uint256 period_);

    function withdrawFunds() external;
}

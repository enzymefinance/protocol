// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestCurveSwaps Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestCurveSwaps {
    function get_best_rate(
        address _from,
        address _to,
        uint256 _amount
    ) external view returns (address bestPool_, uint256 amountReceived_);
}

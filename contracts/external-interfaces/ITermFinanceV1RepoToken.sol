// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1RepoToken Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1RepoToken {
    function redemptionValue() external view returns (uint256 redemptionValue_);

    function totalRedemptionValue() external view returns (uint256 totalRedemptionValue);
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ITermFinanceV1RepoToken {
    function redemptionValue() external view returns (uint256 redemptionValue_);
}

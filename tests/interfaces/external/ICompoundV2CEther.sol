// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;

interface ICompoundV2CEther {
    function accrueInterest() external returns (uint256 interest_);

    function mint() external payable;

    function repayBorrow() external payable;
}

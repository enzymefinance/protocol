// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;

interface IPendleV2StandardizedYield {
    function exchangeRate() external view returns (uint256 res_);
}

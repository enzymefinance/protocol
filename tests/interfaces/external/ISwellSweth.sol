// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ISwellSweth {
    function ethToSwETHRate() external view returns (uint256);
}

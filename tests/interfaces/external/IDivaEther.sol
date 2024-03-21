// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface IDivaEther {
    function convertToShares(uint256 _assets) external returns (uint256 shares_);

    function deposit() external payable returns (uint256 shares_);
}

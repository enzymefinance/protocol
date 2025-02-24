// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0 <0.9.0;

interface IParaSwapV6FeeVault {
    function getBalance(address _tokenAddress, address _partnerAddress) external view returns (uint256 feeBalance_);
}

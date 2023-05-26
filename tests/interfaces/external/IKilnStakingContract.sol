// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

interface IKilnStakingContract {
    function deposit() external payable;

    function getCLFeeRecipient(bytes calldata _publicKey) external view returns (address feeRecipient_);

    function getELFeeRecipient(bytes calldata _publicKey) external view returns (address feeRecipient_);

    function getGlobalFee() external view returns (uint256 globalFee_);
}

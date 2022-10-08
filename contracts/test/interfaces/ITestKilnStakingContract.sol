// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

interface ITestKilnStakingContract {
    event Deposit(
        address indexed caller,
        address indexed withdrawer,
        bytes publicKey,
        bytes signature
    );

    function getELFeeRecipient(bytes calldata _publicKey)
        external
        view
        returns (address elFeeRecipient_);

    function getGlobalFee() external view returns (uint256 gloablFee_);

    function getOperatorFee() external view returns (uint256 operatorFee_);
}

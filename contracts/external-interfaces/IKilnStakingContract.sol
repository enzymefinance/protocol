// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IKilnStakingContract Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IKilnStakingContract {
    function deposit() external payable;

    function getCLFeeRecipient(bytes calldata _publicKey) external view returns (address feeRecipient_);

    function getWithdrawnFromPublicKeyRoot(bytes32 _publicKeyRoot) external view returns (bool withdrawn_);

    function requestValidatorsExit(bytes calldata _publicKeys) external;

    function withdrawCLFee(bytes calldata _publicKey) external;

    function withdrawELFee(bytes calldata _publicKey) external;
}

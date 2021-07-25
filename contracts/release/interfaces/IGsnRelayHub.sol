// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./IGsnTypes.sol";

/// @title IGsnRelayHub Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IGsnRelayHub {
    function balanceOf(address target) external view returns (uint256);

    function calculateCharge(uint256 gasUsed, IGsnTypes.RelayData calldata relayData)
        external
        view
        returns (uint256);

    function depositFor(address target) external payable;

    function relayCall(
        uint256 maxAcceptanceBudget,
        IGsnTypes.RelayRequest calldata relayRequest,
        bytes calldata signature,
        bytes calldata approvalData,
        uint256 externalGasLimit
    ) external returns (bool paymasterAccepted, bytes memory returnValue);

    function withdraw(uint256 amount, address payable dest) external;
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../external-interfaces/IGsnTypes.sol";

/// @title ITestGsnRelayHub Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestGsnRelayHub {
    function balanceOf(address _target) external view returns (uint256 amount_);

    function calculateCharge(uint256 _gasUsed, IGsnTypes.RelayData calldata _relayData)
        external
        view
        returns (uint256 amount_);

    function depositFor(address _target) external payable;

    function relayCall(
        uint256 _maxAcceptanceBudget,
        IGsnTypes.RelayRequest calldata _relayRequest,
        bytes calldata _signature,
        bytes calldata _approvalData,
        uint256 _externalGasLimit
    ) external returns (bool paymasterAccepted_, bytes memory returnValue_);

    function withdraw(uint256 _amount, address payable _dest) external;
}

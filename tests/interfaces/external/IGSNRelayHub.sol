// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

import {IGSNTypes} from "./IGSNTypes.sol";

interface IGSNRelayHub {
    function relayCall(
        uint256 _maxAcceptanceBudget,
        IGSNTypes.RelayRequest calldata _relayRequest,
        bytes calldata _signature,
        bytes calldata _approvalData,
        uint256 _externalGasLimit
    ) external returns (bool paymasterAccepted_, bytes memory returnValue_);
}

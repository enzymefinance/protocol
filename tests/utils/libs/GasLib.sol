// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import "forge-std/console.sol";

library GasLib {
    function logRepeatedCalls(address _contractAddress, bytes memory _data) internal {
        uint256 call1Gas = runCall(_contractAddress, _data);
        uint256 call2Gas = runCall(_contractAddress, _data);

        console.log("Call 1 gas:", uint256(call1Gas));
        console.log("Call 2 gas:", uint256(call2Gas));
        console.log("Gas diff:", uint256(call1Gas - call2Gas));
    }

    function runCall(address _contractAddress, bytes memory _data) internal returns (uint256 gasSpent_) {
        uint256 preGas = gasleft();
        (bool success,) = _contractAddress.call(_data);
        uint256 postGas = gasleft();
        require(success, "runCall: Call failed");

        return preGas - postGas;
    }
}

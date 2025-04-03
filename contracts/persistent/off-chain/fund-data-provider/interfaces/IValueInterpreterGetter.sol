// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/// @notice This interface is used to cast an address into an interface containing a getValueInterpreter getter
interface IValueInterpreterGetter {
    function getValueInterpreter() external view returns (address valueInterpreterAddress_);
}

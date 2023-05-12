// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IPerformanceFee} from "tests/interfaces/internal/IPerformanceFee.sol";

abstract contract PerformanceFeeUtils is Test {
    function deployPerformanceFee(IFeeManager _feeManager) public returns (IPerformanceFee performanceFee_) {
        return IPerformanceFee(deployCode("PerformanceFee.sol", abi.encode(address(_feeManager))));
    }
}

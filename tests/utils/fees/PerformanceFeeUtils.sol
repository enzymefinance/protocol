// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IPerformanceFee} from "tests/interfaces/internal/IPerformanceFee.sol";

abstract contract PerformanceFeeUtils is AddOnUtilsBase {
    function deployPerformanceFee(IFeeManager _feeManager) internal returns (IPerformanceFee performanceFee_) {
        return IPerformanceFee(deployCode("PerformanceFee.sol", abi.encode(address(_feeManager))));
    }
}

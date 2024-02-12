// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFee} from "tests/interfaces/internal/IFee.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

// Not a production type
enum Actions {
    InvokeContinuousFeeHook
}

abstract contract FeeUtils is CoreUtilsBase {
    function encodeFeeManagerConfigData(address[] memory _fees, bytes[] memory _settingsData)
        internal
        pure
        returns (bytes memory configData_)
    {
        return abi.encode(_fees, _settingsData);
    }

    function invokeContinuousFeeHook(IFeeManager _feeManager, IComptrollerLib _comptrollerProxy) internal {
        _comptrollerProxy.callOnExtension({
            _extension: address(_feeManager),
            _actionId: uint256(Actions.InvokeContinuousFeeHook),
            _callArgs: ""
        });
    }
}

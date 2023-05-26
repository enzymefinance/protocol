// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {ICumulativeSlippageTolerancePolicy} from "tests/interfaces/internal/ICumulativeSlippageTolerancePolicy.sol";
import {IPolicyManager} from "tests/interfaces/internal/IPolicyManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract CumulativeSlippageTolerancePolicyUtils is AddOnUtilsBase {
    function encodeCumulativeSlippageTolerancePolicySettings(uint64 _tolerance)
        internal
        pure
        returns (bytes memory settingsData_)
    {
        return abi.encode(_tolerance);
    }

    function deployCumulativeSlippageTolerancePolicy(
        IPolicyManager _policyManager,
        IAddressListRegistry _addressListRegistry,
        IValueInterpreter _valueInterpreter,
        IERC20 _wethToken,
        uint256 _bypassableAdaptersListId,
        uint256 _tolerancePeriodDuration,
        uint256 _pricelessAssetBypassTimelock,
        uint256 _pricelessAssetBypassTimeLimit
    ) internal returns (ICumulativeSlippageTolerancePolicy) {
        return ICumulativeSlippageTolerancePolicy(
            deployCode(
                "CumulativeSlippageTolerancePolicy.sol",
                abi.encode(
                    _policyManager,
                    _addressListRegistry,
                    _valueInterpreter,
                    _wethToken,
                    _bypassableAdaptersListId,
                    _tolerancePeriodDuration,
                    _pricelessAssetBypassTimelock,
                    _pricelessAssetBypassTimeLimit
                )
            )
        );
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

import {IWETH} from "tests/interfaces/external/IWETH.sol";
import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {ICumulativeSlippageTolerancePolicy} from "tests/interfaces/internal/ICumulativeSlippageTolerancePolicy.sol";
import {IPolicyManager} from "tests/interfaces/internal/IPolicyManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

abstract contract CumulativeSlippageTolerancePolicyUtils is Test {
    function encodeCumulativeSlippageTolerancePolicySettings(uint64 _tolerance)
        public
        pure
        returns (bytes memory settingsData_)
    {
        return abi.encode(_tolerance);
    }

    function deployCumulativeSlippageTolerancePolicy(
        IPolicyManager _policyManager,
        IAddressListRegistry _addressListRegistry,
        IValueInterpreter _valueInterpreter,
        IWETH _wethToken,
        uint256 _bypassableAdaptersListId,
        uint256 _tolerancePeriodDuration,
        uint256 _pricelessAssetBypassTimelock,
        uint256 _pricelessAssetBypassTimeLimit
    ) public returns (ICumulativeSlippageTolerancePolicy) {
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

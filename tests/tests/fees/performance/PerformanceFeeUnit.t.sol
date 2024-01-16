// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "openzeppelin-solc-0.8/token/ERC20/IERC20.sol";
import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";

import {IFeeManager as IFeeManagerProd} from "contracts/release/extensions/fee-manager/IFeeManager.sol";

import {UnitTest} from "tests/bases/UnitTest.sol";
import {PerformanceFeeUtils} from "tests/utils/fees/PerformanceFeeUtils.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IPerformanceFee} from "tests/interfaces/internal/IPerformanceFee.sol";

contract PerformanceFeeTest is UnitTest, PerformanceFeeUtils {
    using Address for address;

    event ActivatedForFund(address indexed comptrollerProxy, uint256 highWaterMark);
    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate);

    IPerformanceFee internal performanceFee;
    address internal feeManager = makeAddr("FeeManager");

    function setUp() public {
        performanceFee = deployPerformanceFee({_feeManager: IFeeManager(feeManager)});
    }

    function test_activateForFund_success(uint256 _grossShareValue) public {
        address _comptrollerProxy = makeAddr("ComptrollerProxy");

        // ComptrollerProxy.calcGrossShareValue() = grossShareValue
        vm.mockCall({
            callee: _comptrollerProxy,
            data: abi.encodeWithSelector(IComptrollerLib.calcGrossShareValue.selector),
            returnData: abi.encode(_grossShareValue)
        });

        expectEmit(address(performanceFee));
        emit ActivatedForFund(_comptrollerProxy, _grossShareValue);

        vm.prank(feeManager);
        performanceFee.activateForFund(_comptrollerProxy, address(0));

        assertEq(performanceFee.getFeeInfoForFund(_comptrollerProxy).highWaterMark, _grossShareValue);
    }

    function test_addFundSettings_failsWithRateOfZero() public {
        vm.expectRevert("addFundSettings: feeRate must be greater than 0");
        vm.prank(feeManager);
        performanceFee.addFundSettings(address(0), abi.encode(0, address(0)));
    }

    function test_addFundSettings_failsWithRateOverOneHundredPercent() public {
        vm.expectRevert("addFundSettings: feeRate max exceeded");
        vm.prank(feeManager);
        performanceFee.addFundSettings(address(0), abi.encode(BPS_ONE_HUNDRED_PERCENT + 1, address(0)));
    }

    function test_addFundSettings_success(uint256 _feeRate) public {
        address feeRecipient = makeAddr("FeeRecipient");
        address comptrollerProxy = makeAddr("ComptrollerProxy");

        _feeRate = bound(_feeRate, 1, BPS_ONE_HUNDRED_PERCENT);

        expectEmit(address(performanceFee));
        emit FundSettingsAdded(comptrollerProxy, _feeRate);

        vm.prank(feeManager);
        performanceFee.addFundSettings(comptrollerProxy, abi.encode(_feeRate, feeRecipient));

        assertEq(performanceFee.getFeeInfoForFund(comptrollerProxy).rate, _feeRate);
    }

    function test_settlesOnHook() public {
        for (uint256 i; i < uint256(type(IFeeManagerProd.FeeHook).max); i++) {
            bytes memory returnData = address(performanceFee).functionStaticCall(
                abi.encodeWithSelector(performanceFee.settlesOnHook.selector, i)
            );

            (bool updates, bool usesGav) = abi.decode(returnData, (bool, bool));

            // Only these hooks are used, and all use GAV
            if (
                i == uint256(IFeeManagerProd.FeeHook.PreBuyShares)
                    || i == uint256(IFeeManagerProd.FeeHook.PreRedeemShares)
                    || i == uint256(IFeeManagerProd.FeeHook.Continuous)
            ) {
                assertTrue(updates);
                assertTrue(usesGav);
            } else {
                assertFalse(updates);
                assertFalse(usesGav);
            }
        }
    }

    function test_updatesOnHook() public {
        for (uint256 i; i < uint256(type(IFeeManagerProd.FeeHook).max); i++) {
            bytes memory returnData = address(performanceFee).functionStaticCall(
                abi.encodeWithSelector(performanceFee.updatesOnHook.selector, i)
            );

            (bool updates, bool usesGav) = abi.decode(returnData, (bool, bool));

            // Only these hooks are used, and all use GAV
            if (
                i == uint256(IFeeManagerProd.FeeHook.PostBuyShares)
                    || i == uint256(IFeeManagerProd.FeeHook.PreRedeemShares)
                    || i == uint256(IFeeManagerProd.FeeHook.Continuous)
            ) {
                assertTrue(updates);
                assertTrue(usesGav);
            } else {
                assertFalse(updates);
                assertFalse(usesGav);
            }
        }
    }
}

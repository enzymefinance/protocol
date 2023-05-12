// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {PerformanceFeeUtils} from "tests/utils/fees/PerformanceFeeUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IPerformanceFee} from "tests/interfaces/internal/IPerformanceFee.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

contract PerformanceFeeTest is IntegrationTest, PerformanceFeeUtils {
    IPerformanceFee internal performanceFee;

    function setUp() public override {
        super.setUp();

        performanceFee = deployPerformanceFee(core.release.feeManager);
    }

    function test_integration() public {
        address vaultOwner = makeAddr("VaultOwner");
        address feeRecipient = makeAddr("FeeRecipient");
        address sharesBuyer = makeAddr("SharesBuyer");

        IERC20 denominationAsset = nonStandardPrimitive;
        uint8 denominationAssetDecimals = denominationAsset.decimals();
        uint256 denominationAssetUnit = 10 ** denominationAssetDecimals;

        uint256 feeRate = 1_000; // 10%

        address[] memory fees = new address[](1);
        fees[0] = address(performanceFee);

        bytes[] memory settings = new bytes[](1);
        settings[0] = abi.encode(feeRate, feeRecipient);

        bytes memory feeManagerConfigData = abi.encode(fees, settings);

        (IComptroller comptrollerProxy, IVault vaultProxy) = createVault({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: vaultOwner,
            _denominationAsset: address(denominationAsset),
            _sharesActionTimelock: 0,
            _feeManagerConfigData: feeManagerConfigData,
            _policyManagerConfigData: ""
        });
        IERC20 sharesToken = IERC20(address(vaultProxy));

        // buy shares
        uint256 depositAmount = denominationAssetUnit * 5;
        buyShares({_sharesBuyer: sharesBuyer, _comptrollerProxy: comptrollerProxy, _amountToDeposit: depositAmount});

        uint256 depositorInitialSharesBal = sharesToken.balanceOf(sharesBuyer);

        // redeem some shares; no performance paid out
        redeemSharesInKind({
            _redeemer: sharesBuyer,
            _comptrollerProxy: comptrollerProxy,
            _sharesQuantity: depositorInitialSharesBal / 3
        });

        // bump performance by sending denom asset to vault
        uint256 performanceBumpPercent = ONE_PERCENT * 20;
        deal(
            address(denominationAsset),
            address(vaultProxy),
            (depositAmount * performanceBumpPercent) / ONE_HUNDRED_PERCENT
        );

        // redeem some more shares
        redeemSharesInKind({
            _redeemer: sharesBuyer,
            _comptrollerProxy: comptrollerProxy,
            _sharesQuantity: depositorInitialSharesBal / 3
        });

        // validate fee payout
        // assertGt(sharesToken.balanceOf(feeRecipient), 0);

        // TODO: IMPROVE TEST CASE; stack-too-deep, more assertions, fuzz?
    }
}

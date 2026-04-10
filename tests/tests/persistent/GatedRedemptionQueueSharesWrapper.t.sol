// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {
    IGatedRedemptionQueueSharesWrapper,
    IGatedRedemptionQueueSharesWrapperLib
} from "tests/interfaces/internal/IGatedRedemptionQueueSharesWrapperLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

/// @dev Other tests are placed in the legacy hardhat tests branch
contract GatedRedemptionQueueSharesWrapperTest is IntegrationTest {
    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal vaultProxyAddress;

    IGatedRedemptionQueueSharesWrapperLib internal gatedRedemptionQueueSharesWrapper;

    function setUp() public override {
        setUpStandaloneEnvironment();

        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        comptrollerProxyAddress = address(comptrollerProxy);
        vaultProxyAddress = address(vaultProxy);

        gatedRedemptionQueueSharesWrapper = __deployLib();
    }

    // DEPLOYMENT HELPERS

    function __deployLib() internal returns (IGatedRedemptionQueueSharesWrapperLib lib_) {
        bytes memory args = abi.encode(core.persistent.globalConfigProxy, address(wrappedNativeToken));

        return
            IGatedRedemptionQueueSharesWrapperLib(payable(deployCode("GatedRedemptionQueueSharesWrapperLib.sol", args)));
    }

    // TEST HELPERS

    function __setup_wrapperAndHolder() internal returns (address holder1_) {
        IERC20 denominationAsset = IERC20(IComptrollerLib(comptrollerProxyAddress).getDenominationAsset());

        // Window config: firstWindowStart far in the future so we are outside the window
        IGatedRedemptionQueueSharesWrapper.RedemptionWindowConfig memory windowConfig =
            IGatedRedemptionQueueSharesWrapper.RedemptionWindowConfig({
                firstWindowStart: uint64(block.timestamp + 365 days),
                frequency: uint32(30 days),
                duration: uint32(1 days),
                relativeSharesCap: uint64(1e18)
            });

        gatedRedemptionQueueSharesWrapper.init({
            _vaultProxy: vaultProxyAddress,
            _managers: new address[](0),
            _redemptionAsset: address(denominationAsset),
            _useDepositApprovals: false,
            _useRedemptionApprovals: false,
            _useTransferApprovals: false,
            _depositMode: IGatedRedemptionQueueSharesWrapper.DepositMode.wrap(uint8(0)),
            _windowConfig: windowConfig
        });

        // Create holder and deposit into wrapper to get wrapped shares
        address holder1 = makeAddr("Holder1");
        uint256 depositAmount = assetUnit(denominationAsset) * 100;

        increaseTokenBalance({_token: denominationAsset, _to: holder1, _amount: depositAmount});

        vm.startPrank(holder1);
        denominationAsset.approve(address(gatedRedemptionQueueSharesWrapper), depositAmount);
        gatedRedemptionQueueSharesWrapper.deposit({
            _depositAsset: address(denominationAsset), _depositAssetAmount: depositAmount, _minSharesAmount: 1
        });
        vm.stopPrank();

        return holder1;
    }

    // TESTS

    function test_requestRedeem_failsWithZeroAmount() public {
        address holder1 = __setup_wrapperAndHolder();

        vm.expectRevert("requestRedeem: Zero amount");
        vm.prank(holder1);
        gatedRedemptionQueueSharesWrapper.requestRedeem({_sharesAmount: 0});
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IPolicyManager as IPolicyManagerProd} from "contracts/release/extensions/policy-manager/IPolicyManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAllowedRedeemersForSpecificAssetsPolicy} from
    "tests/interfaces/internal/IAllowedRedeemersForSpecificAssetsPolicy.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

// TODO: Technically this only tests the current version (i.e., v5)... could make version-agnostic like integrations

contract AllowedRedeemersForSpecificAssetsPolicy is IntegrationTest {
    IAllowedRedeemersForSpecificAssetsPolicy internal policy;
    address allowedRedeemer = makeAddr("AllowedRedeemer");

    function setUp() public override {
        setUpStandaloneEnvironment();

        policy = __deployPolicy();
    }

    // HELPERS

    function __deployPolicy() private returns (IAllowedRedeemersForSpecificAssetsPolicy policy_) {
        return IAllowedRedeemersForSpecificAssetsPolicy(
            deployCode(
                "AllowedRedeemersForSpecificAssetsPolicy.sol",
                abi.encode(core.release.policyManager, core.persistent.addressListRegistry)
            )
        );
    }

    function __encodeFundSettings() private returns (bytes memory encodedSettings_) {
        // Include an extra redeemer to test that any item in list passes rule
        address extraRedeemer = makeAddr("ExtraRedeemer");

        return
            encodeAddressListRegistryPolicySettingsWithNewList({_initialItems: toArray(allowedRedeemer, extraRedeemer)});
    }

    // TESTS

    function test_canDisable_success() public {
        assertTrue(policy.canDisable(), "Should be disableable");
    }

    function test_implementedHooks_success() public {
        IAllowedRedeemersForSpecificAssetsPolicy.PolicyHook[] memory implementedHooks = policy.implementedHooks();

        // Only RedeemSharesForSpecificAssets
        assertEq(implementedHooks.length, 1, "Unexpected number of implemented hooks");
        assertEq(
            IAllowedRedeemersForSpecificAssetsPolicy.PolicyHook.unwrap(implementedHooks[0]),
            uint8(IPolicyManagerProd.PolicyHook.RedeemSharesForSpecificAssets),
            "Unexpected hook"
        );
    }

    function test_validateRule_failsWithUnallowedRedeemer() public {
        __test_validateRule({_redeemer: makeAddr("UnallowedRedeemer")});
    }

    function test_validateRule_successWithAllowedRedeemer() public {
        __test_validateRule({_redeemer: allowedRedeemer});
    }

    function __test_validateRule(address _redeemer) internal {
        // Create a fund with the policy
        IERC20 denominationAsset = wethToken;
        (IComptrollerLib comptrollerProxy, IVaultLib vaultProxy,) = createFundWithPolicy({
            _fundDeployer: core.release.fundDeployer,
            _denominationAsset: wethToken,
            _policyAddress: address(policy),
            _policySettings: __encodeFundSettings()
        });

        // Buy some shares for the redeemer
        buyShares({
            _sharesBuyer: _redeemer,
            _comptrollerProxy: comptrollerProxy,
            _amountToDeposit: assetUnit(denominationAsset)
        });

        uint256 sharesToRedeem = vaultProxy.balanceOf(_redeemer);

        // Should fail if the redeemer is not allowed
        if (_redeemer != allowedRedeemer) {
            vm.expectRevert("Rule evaluated to false: ALLOWED_REDEEMERS_FOR_SPECIFIC_ASSETS");
        }

        redeemSharesForAsset({
            _redeemer: _redeemer,
            _comptrollerProxy: comptrollerProxy,
            _sharesQuantity: sharesToRedeem,
            _asset: denominationAsset
        });
    }
}

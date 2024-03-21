// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IGenericWrappingAdapterBase} from "tests/interfaces/internal/IGenericWrappingAdapterBase.sol";

abstract contract TestBase is IntegrationTest {
    // Allowed abs tolerance for ratePerUnderlying conversion
    uint256 rateConversionTolerance = 10;

    EnzymeVersion version;
    address adapterAddress;
    IERC20 underlyingToken;
    IERC20 derivativeToken;
    uint256 ratePerUnderlying;
    bool testWrap;
    bool testUnwrap;

    address fundOwner;
    address vaultProxyAddress;
    address comptrollerProxyAddress;

    function __initialize(
        EnzymeVersion _version,
        address _adapterAddress,
        address _underlyingTokenAddress,
        address _derivativeTokenAddress,
        uint256 _ratePerUnderlying,
        bool _testWrap,
        bool _testUnwrap
    ) internal {
        version = _version;
        adapterAddress = _adapterAddress;
        underlyingToken = IERC20(_underlyingTokenAddress);
        derivativeToken = IERC20(_derivativeTokenAddress);
        ratePerUnderlying = _ratePerUnderlying;
        testWrap = _testWrap;
        testUnwrap = _testUnwrap;

        // If v4, register assets to pass the asset universe validation
        if (version == EnzymeVersion.V4) {
            v4AddPrimitiveWithTestAggregator({_tokenAddress: address(underlyingToken), _skipIfRegistered: true});
            v4AddPrimitiveWithTestAggregator({_tokenAddress: address(derivativeToken), _skipIfRegistered: true});
        }

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);
    }

    // ACTION HELPERS

    function __wrap(uint256 _amount, uint256 _minIncomingAmount) internal {
        bytes memory actionArgs = abi.encode(_amount, _minIncomingAmount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: adapterAddress,
            _selector: IGenericWrappingAdapterBase.wrap.selector
        });
    }

    function __unwrap(uint256 _amount, uint256 _minIncomingAmount) internal {
        bytes memory actionArgs = abi.encode(_amount, _minIncomingAmount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: adapterAddress,
            _selector: IGenericWrappingAdapterBase.unwrap.selector
        });
    }

    // TESTS

    function test_wrap_success() public {
        if (!testWrap) {
            return;
        }

        // Send some underlying token balance to the vault
        uint256 underlyingBalancePre = assetUnit(underlyingToken) * 31;
        increaseTokenBalance({_token: underlyingToken, _to: vaultProxyAddress, _amount: underlyingBalancePre});

        // Define part of the vault balance to use
        uint256 amountToWrap = underlyingToken.balanceOf(vaultProxyAddress) / 5;
        assertNotEq(amountToWrap, 0, "Amount to wrap is 0");

        // Arbitrary minIncomingAmount
        uint256 minIncomingAmount = 123;

        vm.recordLogs();

        // Action
        __wrap({_amount: amountToWrap, _minIncomingAmount: minIncomingAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(underlyingToken)),
            _maxSpendAssetAmounts: toArray(amountToWrap),
            _incomingAssets: toArray(address(derivativeToken)),
            _minIncomingAssetAmounts: toArray(minIncomingAmount)
        });

        uint256 expectedIncomingAmount = amountToWrap * ratePerUnderlying / assetUnit(underlyingToken);

        assertApproxEqAbs(
            derivativeToken.balanceOf(vaultProxyAddress),
            expectedIncomingAmount,
            rateConversionTolerance,
            "Mismatch between received and expected derivative token balance"
        );

        assertEq(
            underlyingToken.balanceOf(vaultProxyAddress),
            underlyingBalancePre - amountToWrap,
            "Mismatch between sent and expected underlying balance"
        );
    }

    function test_unwrap_success() public {
        if (!testUnwrap) {
            return;
        }

        // Send some derivative token balance to the vault
        uint256 derivativeBalancePre = assetUnit(derivativeToken) * 31;
        increaseTokenBalance({_token: derivativeToken, _to: vaultProxyAddress, _amount: derivativeBalancePre});

        // Define part of the vault balance to use
        uint256 amountToUnwrap = underlyingToken.balanceOf(vaultProxyAddress) / 5;
        assertNotEq(amountToUnwrap, 0, "Amount to unwrap is 0");

        // Arbitrary minIncomingAmount
        uint256 minIncomingAmount = 123;

        vm.recordLogs();

        // Action
        __unwrap({_amount: amountToUnwrap, _minIncomingAmount: minIncomingAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(derivativeToken)),
            _maxSpendAssetAmounts: toArray(amountToUnwrap),
            _incomingAssets: toArray(address(underlyingToken)),
            _minIncomingAssetAmounts: toArray(minIncomingAmount)
        });

        uint256 expectedIncomingAmount = amountToUnwrap * assetUnit(derivativeToken) / ratePerUnderlying;

        assertApproxEqAbs(
            underlyingToken.balanceOf(vaultProxyAddress),
            expectedIncomingAmount,
            rateConversionTolerance,
            "Mismatch between received and expected underlying balance"
        );

        assertEq(
            derivativeToken.balanceOf(vaultProxyAddress),
            derivativeBalancePre - amountToUnwrap,
            "Mismatch between sent and expected derivative token balance"
        );
    }
}

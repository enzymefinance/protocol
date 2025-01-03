// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC4626} from "openzeppelin-solc-0.8/token/ERC20/extensions/ERC4626.sol";

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IMorphoSupplyVault} from "tests/interfaces/external/IMorphoSupplyVault.sol";
import {IMorphoMorpho} from "tests/interfaces/external/IMorphoMorpho.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IERC4626Adapter} from "tests/interfaces/internal/IERC4626Adapter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

import {ETHEREUM_MORPHO_RE7_USDC_VAULT_ADDRESS, ETHEREUM_SPARK_SDAI_VAULT_ADDRESS} from "./ERC4626Utils.sol";

abstract contract ERC4626AdapterTestBase is IntegrationTest {
    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IERC4626Adapter internal erc4626Adapter;
    IERC4626 internal erc4626Vault;
    IERC20 internal underlying;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version, address _erc4626VaultAddress) internal {
        setUpMainnetEnvironment();

        version = _version;

        erc4626Adapter = __deployAdapter();
        erc4626Vault = IERC4626(_erc4626VaultAddress);
        underlying = IERC20(erc4626Vault.asset());

        // If v4, register incoming asset to pass the asset universe validation
        if (version == EnzymeVersion.V4) {
            address[] memory tokenAddresses = new address[](2);
            tokenAddresses[0] = address(underlying);
            tokenAddresses[1] = address(_erc4626VaultAddress);
            v4AddPrimitivesWithTestAggregator({_tokenAddresses: tokenAddresses, _skipIfRegistered: true});
        }

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Seed the vault with some underlying
        increaseTokenBalance({_token: underlying, _to: vaultProxyAddress, _amount: assetUnit(underlying) * 31});
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter() private returns (IERC4626Adapter) {
        bytes memory args = abi.encode(getIntegrationManagerAddressForVersion(version));
        address addr = deployCode("ERC4626Adapter.sol", args);
        return IERC4626Adapter(addr);
    }

    // ACTION HELPERS

    function __lend(uint256 _underlyingAmount, uint256 _minIncomingSharesAmount) private {
        bytes memory actionArgs = abi.encode(address(erc4626Vault), _underlyingAmount, _minIncomingSharesAmount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(erc4626Adapter),
            _selector: IERC4626Adapter.lend.selector
        });
    }

    function __redeem(uint256 _sharesAmount, uint256 _minIncomingUnderlyingAmount) private {
        bytes memory actionArgs = abi.encode(address(erc4626Vault), _sharesAmount, _minIncomingUnderlyingAmount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(erc4626Adapter),
            _selector: IERC4626Adapter.redeem.selector
        });
    }

    function test_lend_success() public {
        uint256 underlyingBalancePre = underlying.balanceOf(vaultProxyAddress);
        uint256 amountToDeposit = underlying.balanceOf(vaultProxyAddress) / 5;
        uint256 minIncomingSharesAmount = 123;

        assertNotEq(amountToDeposit, 0, "Amount to deposit is 0");

        uint256 expectedSharesAmount = erc4626Vault.convertToShares({assets: amountToDeposit});

        vm.recordLogs();

        __lend({_underlyingAmount: amountToDeposit, _minIncomingSharesAmount: minIncomingSharesAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(underlying)),
            _maxSpendAssetAmounts: toArray(amountToDeposit),
            _incomingAssets: toArray(address(erc4626Vault)),
            _minIncomingAssetAmounts: toArray(minIncomingSharesAmount)
        });

        assertEq(
            erc4626Vault.balanceOf(vaultProxyAddress),
            expectedSharesAmount,
            "Mismatch between received and expected erc4626 balance"
        );

        assertEq(
            underlyingBalancePre - underlying.balanceOf(vaultProxyAddress),
            amountToDeposit,
            "Mismatch between sent and expected underlying balance"
        );
    }

    function test_redeem_success() public {
        uint256 amountToDeposit = underlying.balanceOf(vaultProxyAddress) / 5;

        __lend({_underlyingAmount: amountToDeposit, _minIncomingSharesAmount: 0});

        uint256 underlyingBalancePre = underlying.balanceOf(vaultProxyAddress);
        uint256 sharesBalance = IERC20(address(erc4626Vault)).balanceOf(vaultProxyAddress);
        uint256 expectedUnderlyingAmount = erc4626Vault.previewRedeem({shares: sharesBalance});
        uint256 minIncomingUnderlyingAmount = 123;

        vm.recordLogs();

        __redeem({_sharesAmount: sharesBalance, _minIncomingUnderlyingAmount: minIncomingUnderlyingAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Approve),
            _spendAssets: toArray(address(erc4626Vault)),
            _maxSpendAssetAmounts: toArray(sharesBalance),
            _incomingAssets: toArray(address(underlying)),
            _minIncomingAssetAmounts: toArray(minIncomingUnderlyingAmount)
        });

        uint256 expectedUnderlyingBalance = underlyingBalancePre + expectedUnderlyingAmount;

        assertEq(
            underlying.balanceOf(vaultProxyAddress),
            expectedUnderlyingBalance,
            "Mismatch between received and expected erc4626 underlying balance"
        );
    }
}

contract MorphoRe7USDCTest is ERC4626AdapterTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current, _erc4626VaultAddress: ETHEREUM_MORPHO_RE7_USDC_VAULT_ADDRESS});
    }
}

contract MorphoRe7USDCTestV4 is ERC4626AdapterTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current, _erc4626VaultAddress: ETHEREUM_MORPHO_RE7_USDC_VAULT_ADDRESS});
    }
}

contract SparkTest is ERC4626AdapterTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current, _erc4626VaultAddress: ETHEREUM_SPARK_SDAI_VAULT_ADDRESS});
    }
}

contract SparkTestV4 is ERC4626AdapterTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4, _erc4626VaultAddress: ETHEREUM_SPARK_SDAI_VAULT_ADDRESS});
    }
}

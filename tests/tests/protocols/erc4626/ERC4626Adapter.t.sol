// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC4626} from "openzeppelin-solc-0.8/token/ERC20/extensions/ERC4626.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {SpendAssetsHandleType} from "tests/utils/core/AdapterUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IERC4626Adapter} from "tests/interfaces/internal/IERC4626Adapter.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";
import {
    ETHEREUM_MORPHO_MAWETH_VAULT_ADDRESS,
    ETHEREUM_MORPHO_MA3WETH_VAULT_ADDRESS,
    ETHEREUM_MORPHO_MCWETH_VAULT_ADDRESS,
    ETHEREUM_SPARK_SDAI_VAULT_ADDRESS
} from "./ERC4626Utils.sol";

abstract contract ERC4626AdapterTestBase is IntegrationTest {
    address internal vaultOwner = makeAddr("VaultOwner");

    IVault internal vaultProxy;
    IComptroller internal comptrollerProxy;

    IERC4626Adapter internal erc4626Adapter;
    IERC4626 internal erc4626Vault;
    IERC20 internal underlying;

    function setUp(address _erc4626VaultAddress) internal {
        erc4626Adapter = __deployAdapter();
        erc4626Vault = IERC4626(_erc4626VaultAddress);
        underlying = IERC20(erc4626Vault.asset());

        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(underlying),
            _skipIfRegistered: true
        });

        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(_erc4626VaultAddress),
            _skipIfRegistered: true
        });

        // Create a fund with the ERC4626 underlying as the denomination asset
        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: vaultOwner,
            _sharesBuyer: vaultOwner,
            _denominationAsset: address(underlying),
            _amountToDeposit: assetUnit(underlying) * 31
        });
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter() private returns (IERC4626Adapter) {
        bytes memory args = abi.encode(core.release.integrationManager);
        address addr = deployCode("ERC4626Adapter.sol", args);
        return IERC4626Adapter(addr);
    }

    // ACTION HELPERS

    function __lend(uint256 _underlyingAmount, uint256 _minIncomingSharesAmount) private {
        bytes memory integrationData = abi.encode(address(erc4626Vault), _underlyingAmount, _minIncomingSharesAmount);
        bytes memory callArgs = abi.encode(address(erc4626Adapter), IERC4626Adapter.lend.selector, integrationData);

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: callArgs
        });
    }

    function __redeem(uint256 _sharesAmount, uint256 _minIncomingUnderlyingAmount) private {
        bytes memory integrationData = abi.encode(address(erc4626Vault), _sharesAmount, _minIncomingUnderlyingAmount);
        bytes memory callArgs = abi.encode(address(erc4626Adapter), IERC4626Adapter.redeem.selector, integrationData);

        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _caller: vaultOwner,
            _callArgs: callArgs
        });
    }

    function test_lend_success() public {
        uint256 underlyingBalancePre = underlying.balanceOf(address(vaultProxy));
        uint256 amountToDeposit = underlying.balanceOf(address(vaultProxy)) / 5;
        uint256 minIncomingSharesAmount = 123;

        assertNotEq(amountToDeposit, 0, "Amount to deposit is 0");

        uint256 expectedSharesAmount = erc4626Vault.convertToShares({assets: amountToDeposit});

        vm.recordLogs();

        __lend({_underlyingAmount: amountToDeposit, _minIncomingSharesAmount: minIncomingSharesAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Transfer,
            _spendAssets: toArray(address(underlying)),
            _maxSpendAssetAmounts: toArray(amountToDeposit),
            _incomingAssets: toArray(address(erc4626Vault)),
            _minIncomingAssetAmounts: toArray(minIncomingSharesAmount)
        });

        assertEq(
            erc4626Vault.balanceOf(address(vaultProxy)),
            expectedSharesAmount,
            "Mismatch between received and expected erc4626 balance"
        );

        assertEq(
            underlyingBalancePre - underlying.balanceOf(address(vaultProxy)),
            amountToDeposit,
            "Mismatch between sent and expected underlying balance"
        );
    }

    function test_redeem_success() public {
        uint256 amountToDeposit = underlying.balanceOf(address(vaultProxy)) / 5;

        __lend({_underlyingAmount: amountToDeposit, _minIncomingSharesAmount: 0});

        uint256 underlyingBalancePre = underlying.balanceOf(address(vaultProxy));
        uint256 sharesBalance = IERC20(address(erc4626Vault)).balanceOf(address(vaultProxy));
        uint256 expectedUnderlyingAmount = erc4626Vault.previewRedeem({shares: sharesBalance});
        uint256 minIncomingUnderlyingAmount = 123;

        vm.recordLogs();

        __redeem({_sharesAmount: sharesBalance, _minIncomingUnderlyingAmount: minIncomingUnderlyingAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Approve,
            _spendAssets: toArray(address(erc4626Vault)),
            _maxSpendAssetAmounts: toArray(sharesBalance),
            _incomingAssets: toArray(address(underlying)),
            _minIncomingAssetAmounts: toArray(minIncomingUnderlyingAmount)
        });

        uint256 expectedUnderlyingBalance = underlyingBalancePre + expectedUnderlyingAmount;

        assertEq(
            underlying.balanceOf(address(vaultProxy)),
            expectedUnderlyingBalance,
            "Mismatch between received and expected erc4626 underlying balance"
        );
    }
}

contract MorphoAaveV2Test is ERC4626AdapterTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_MORPHO_MAWETH_VAULT_ADDRESS);
    }
}

contract MorphoAaveV3Test is ERC4626AdapterTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_MORPHO_MA3WETH_VAULT_ADDRESS);
    }
}

contract MorphoCompoundTest is ERC4626AdapterTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_MORPHO_MCWETH_VAULT_ADDRESS);
    }
}

contract SparkTest is ERC4626AdapterTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        super.setUp(ETHEREUM_SPARK_SDAI_VAULT_ADDRESS);
    }
}

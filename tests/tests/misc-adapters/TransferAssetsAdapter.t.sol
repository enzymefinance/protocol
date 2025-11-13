// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {
    IIntegrationManager as IIntegrationManagerProd
} from "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {
    ITransferAssetsAdapter as ITransferAssetsAdapterProd
} from "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/ITransferAssetsAdapter.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {ITransferAssetsAdapter} from "tests/interfaces/internal/ITransferAssetsAdapter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

contract TransferAssetsAdapterTest is IntegrationTest {
    ITransferAssetsAdapter transferAssetsAdapter;

    // Fund values
    address fundOwner;
    address vaultProxyAddress;
    address comptrollerProxyAddress;

    // Common testing values
    address recipient = makeAddr("TransferRecipient");
    address[] assetAddresses;

    function setUp() public override {
        setUpMainnetEnvironment();

        transferAssetsAdapter = __deployAdapter();

        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        comptrollerProxyAddress = address(comptrollerProxy);
        vaultProxyAddress = address(vaultProxy);

        // Define a couple assets to use
        // Include USDT since it's a pain
        assetAddresses = toArray(ETHEREUM_USDT, ETHEREUM_USDC);

        // Seed the vault with some assets
        for (uint256 i; i < assetAddresses.length; i++) {
            IERC20 asset = IERC20(assetAddresses[i]);
            increaseTokenBalance({_token: asset, _to: vaultProxyAddress, _amount: assetUnit(asset) * (31 - i)});
        }
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter() private returns (ITransferAssetsAdapter transferAssetsAdapter_) {
        bytes memory args = abi.encode(address(core.release.integrationManager));
        return ITransferAssetsAdapter(deployCode("TransferAssetsAdapter.sol", args));
    }

    // ACTION HELPERS

    function __transfer(uint256[] memory _amounts) private {
        bytes memory actionArgs = abi.encode(
            ITransferAssetsAdapterProd.TransferERC20CallArgs({
                recipient: recipient, assetAddresses: assetAddresses, amounts: _amounts
            })
        );

        vm.prank(fundOwner);
        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _actionArgs: actionArgs,
            _adapter: address(transferAssetsAdapter),
            _selector: transferAssetsAdapter.transfer.selector
        });
    }

    // TESTS

    function __test_transfer_success(uint256[] memory _amountInputs) private {
        uint256[] memory assetBalancesPre = new uint256[](assetAddresses.length);
        uint256[] memory expectedAmountsToTransfer = new uint256[](assetAddresses.length);
        for (uint256 i; i < assetAddresses.length; i++) {
            uint256 assetBalancePre = IERC20(assetAddresses[i]).balanceOf(vaultProxyAddress);
            uint256 amountInput = _amountInputs[i];

            assetBalancesPre[i] = assetBalancePre;
            expectedAmountsToTransfer[i] = amountInput == type(uint256).max ? assetBalancePre : amountInput;
        }

        // Test parseAssetsForAction encoding prior to actual tx
        assertParseAssetsForAction({
            _vaultProxyAddress: vaultProxyAddress,
            _adapterAddress: address(transferAssetsAdapter),
            _actionSelector: transferAssetsAdapter.transfer.selector,
            _integrationData: abi.encode(
                ITransferAssetsAdapterProd.TransferERC20CallArgs({
                    recipient: recipient, assetAddresses: assetAddresses, amounts: _amountInputs
                })
            ),
            _expectedSpendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Approve),
            _expectedSpendAssets: assetAddresses,
            _expectedMaxSpendAssetAmounts: expectedAmountsToTransfer,
            _expectedIncomingAssets: new address[](0),
            _expectedMinIncomingAssetAmounts: new uint256[](0)
        });

        // Execute the transfers
        __transfer({_amounts: _amountInputs});

        // Assert the amounts transferred and received
        for (uint256 i; i < assetAddresses.length; i++) {
            IERC20 asset = IERC20(assetAddresses[i]);
            uint256 assetBalancePost = asset.balanceOf(vaultProxyAddress);

            assertEq(assetBalancesPre[i] - assetBalancePost, expectedAmountsToTransfer[i], "Unexpected sent amount");
            assertEq(asset.balanceOf(recipient), expectedAmountsToTransfer[i], "Unexpected received amount");
        }
    }

    function test_transfer_successWithPartialBalances() public {
        uint256[] memory amountInputs = new uint256[](assetAddresses.length);
        for (uint256 i; i < assetAddresses.length; i++) {
            uint256 balance = IERC20(assetAddresses[i]).balanceOf(vaultProxyAddress);
            amountInputs[i] = balance / 5;
        }

        __test_transfer_success({_amountInputs: amountInputs});
    }

    function test_transfer_successWithMaxBalances() public {
        uint256[] memory amountInputs = new uint256[](assetAddresses.length);
        for (uint256 i; i < assetAddresses.length; i++) {
            amountInputs[i] = type(uint256).max;
        }

        __test_transfer_success({_amountInputs: amountInputs});
    }
}

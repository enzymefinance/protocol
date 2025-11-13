// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IBebopBlend as IBebopBlendProd} from "contracts/external-interfaces/IBebopBlend.sol";
import {
    IAddressListRegistry as IAddressListRegistryProd
} from "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {
    IBebopBlendAdapter as IBebopBlendAdapterProd
} from "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IBebopBlendAdapter.sol";
import {
    IIntegrationManager as IIntegrationManagerProd
} from "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IBebopBlend} from "tests/interfaces/external/IBebopBlend.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IBebopBlendAdapter} from "tests/interfaces/internal/IBebopBlendAdapter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

// BebopBlend contract
IBebopBlend constant BEBOP_BLEND = IBebopBlend(0xbbbbbBB520d69a9775E85b458C58c648259FAD5F);

abstract contract TestBase is IntegrationTest {
    // Adapter
    IBebopBlendAdapter internal bebopBlendAdapter;

    // Fund components
    IComptrollerLib internal comptrollerProxy;
    address internal fundOwner;
    IVaultLib internal vaultProxy;

    // Test tokens
    IERC20 internal makerToken;
    IERC20 internal takerToken;

    // Users
    uint256 internal trustedMakerPrivateKey;
    address internal trustedMaker;

    function __initialize(address _makerTokenAddress, address _takerTokenAddress) internal {
        // Set token addresses
        makerToken = IERC20(_makerTokenAddress);
        takerToken = IERC20(_takerTokenAddress);

        // Register all incoming assets to pass the asset universe validation
        addPrimitivesWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddresses: toArray(address(makerToken), address(takerToken)),
            _skipIfRegistered: true
        });

        // Generate a trusted maker
        (trustedMaker, trustedMakerPrivateKey) = makeAddrAndKey("trustedMaker");

        // Add maker to a new list in the AddressListRegistry
        uint256 trustedMakersListId;
        (trustedMakersListId,) = createRegisteredAddressList({
            _addressListRegistry: core.persistent.addressListRegistry, _item: trustedMaker
        });

        // Deploy adapter with a trusted makers list
        bebopBlendAdapter = __deployAdapter({_trustedMakersListId: trustedMakersListId});

        // Create a fund
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});

        // Seed the vault with test tokens
        increaseTokenBalance({_token: takerToken, _to: address(vaultProxy), _amount: 10 * assetUnit(takerToken)});

        // Seed the trusted maker with tokens
        increaseTokenBalance({_token: makerToken, _to: trustedMaker, _amount: 300 * assetUnit(makerToken)});

        // Grant max approval from maker to Bebop contract
        vm.prank(trustedMaker);
        makerToken.approve(address(BEBOP_BLEND), type(uint256).max);
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(uint256 _trustedMakersListId) internal returns (IBebopBlendAdapter adapter_) {
        address adapterAddress = deployCode(
            "BebopBlendAdapter.sol",
            abi.encode(
                address(core.release.integrationManager),
                BEBOP_BLEND,
                address(core.persistent.addressListRegistry),
                _trustedMakersListId
            )
        );
        return IBebopBlendAdapter(payable(adapterAddress));
    }

    // ACTION HELPERS

    function __action(IBebopBlendAdapterProd.Action _actionId, bytes memory _encodedActionArgs) internal {
        bytes memory actionArgs = abi.encode(_actionId, _encodedActionArgs);

        vm.prank(fundOwner);
        callOnIntegration({
            _integrationManager: core.release.integrationManager,
            _comptrollerProxy: comptrollerProxy,
            _adapter: address(bebopBlendAdapter),
            _selector: IBebopBlendAdapter.action.selector,
            _actionArgs: actionArgs
        });
    }

    function __swapSingle(IBebopBlend.Single memory _order, bytes memory _signature, uint256 _minIncomingAssetAmount)
        internal
    {
        IBebopBlendProd.MakerSignature memory makerSignature =
            IBebopBlendProd.MakerSignature({signatureBytes: _signature, flags: 0});

        __action({
            _actionId: IBebopBlendAdapterProd.Action.SwapSingle,
            _encodedActionArgs: abi.encode(
                IBebopBlendAdapterProd.SwapSingleActionArgs({
                    order: _order, makerSignature: makerSignature, minIncomingAssetAmount: _minIncomingAssetAmount
                })
            )
        });
    }

    // HELPERS

    function __createSignedSingleOrder(
        address _takerToken,
        uint256 _takerAmount,
        address _makerToken,
        uint256 _makerAmount
    ) internal view returns (IBebopBlend.Single memory order_, bytes memory signature_) {
        order_ = IBebopBlendProd.Single({
            expiry: block.timestamp + 1 hours, // Arbitrary expiry
            taker_address: address(bebopBlendAdapter), // Always use adapter
            maker_address: trustedMaker, // Always use trusted maker
            maker_nonce: 1, // Arbitrary nonce
            taker_token: _takerToken,
            maker_token: _makerToken,
            taker_amount: _takerAmount,
            maker_amount: _makerAmount,
            receiver: address(vaultProxy),
            packed_commands: 0, // Not used
            flags: 0 // Not used
        });

        signature_ = __signSingleOrder(order_);
    }

    // Sign the order hash using the maker's private key
    function __signSingleOrder(IBebopBlend.Single memory _order) internal view returns (bytes memory signature_) {
        bytes32 orderHash =
            BEBOP_BLEND.hashSingleOrder({order: _order, partnerId: 0, updatedMakerAmount: 0, updatedMakerNonce: 0});

        return createSignature({_privateKey: trustedMakerPrivateKey, _digest: orderHash});
    }

    // TESTS - ACTIONS

    function test_swapSingle_failsWithUntrustedMaker() public {
        // Remove trusted maker from the list to make them untrusted
        uint256 listId = bebopBlendAdapter.TRUSTED_MAKERS_LIST_ID();
        address listOwner = core.persistent.addressListRegistry.getListOwner(listId);
        vm.prank(listOwner);
        core.persistent.addressListRegistry.removeFromList({_id: listId, _items: toArray(trustedMaker)});

        (IBebopBlend.Single memory order, bytes memory signature) = __createSignedSingleOrder({
            _takerToken: address(takerToken), _takerAmount: 1, _makerToken: address(makerToken), _makerAmount: 1
        });

        vm.expectRevert(IBebopBlendAdapter.BebopBlendAdapter__SwapSingle__UntrustedMaker.selector);

        __swapSingle({_order: order, _signature: signature, _minIncomingAssetAmount: 1});
    }

    function test_swapSingle_failsWithInvalidReceiver() public {
        address wrongReceiver = makeAddr("wrongReceiver");

        IBebopBlend.Single memory order = IBebopBlendProd.Single({
            expiry: block.timestamp + 1 hours,
            taker_address: address(bebopBlendAdapter),
            maker_address: trustedMaker,
            maker_nonce: 1,
            taker_token: address(takerToken),
            maker_token: address(makerToken),
            taker_amount: 1,
            maker_amount: 1,
            receiver: wrongReceiver, // This is the important part
            packed_commands: 0,
            flags: 0
        });

        bytes memory signature = __signSingleOrder(order);

        vm.expectRevert(
            abi.encodeWithSelector(IBebopBlendAdapter.BebopBlendAdapter__SwapSingle__InvalidReceiver.selector)
        );
        __swapSingle({_order: order, _signature: signature, _minIncomingAssetAmount: 1});
    }

    function test_swapSingle_success() public {
        uint256 takerAmount = takerToken.balanceOf(address(vaultProxy)) / 5;
        uint256 makerAmount = makerToken.balanceOf(trustedMaker);
        uint256 minIncomingAssetAmount = makerAmount / 3;

        // Create signed order
        (IBebopBlend.Single memory order, bytes memory signature) = __createSignedSingleOrder({
            _takerToken: address(takerToken),
            _takerAmount: takerAmount,
            _makerToken: address(makerToken),
            _makerAmount: makerAmount
        });

        uint256 preVaultMakerTokenBalance = makerToken.balanceOf(address(vaultProxy));
        uint256 preVaultTakerTokenBalance = takerToken.balanceOf(address(vaultProxy));

        vm.recordLogs();

        // Execute swap
        __swapSingle({_order: order, _signature: signature, _minIncomingAssetAmount: minIncomingAssetAmount});

        // Assert adapter assets for action
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(takerToken)),
            _maxSpendAssetAmounts: toArray(takerAmount),
            _incomingAssets: toArray(address(makerToken)),
            _minIncomingAssetAmounts: toArray(minIncomingAssetAmount)
        });

        uint256 expectedFulfilledMakerAmount = makerAmount * takerAmount / takerAmount;

        // Assert token balances updates for vault
        assertEq(
            makerToken.balanceOf(address(vaultProxy)),
            preVaultMakerTokenBalance + expectedFulfilledMakerAmount,
            "Incorrect final maker token balance"
        );
        assertEq(
            takerToken.balanceOf(address(vaultProxy)),
            preVaultTakerTokenBalance - takerAmount,
            "Incorrect final taker token balance"
        );
    }

    // TESTS - MISC HELPERS

    function test_isAllowedMaker_successListIdNonZero() public {
        // Uses existing list with trusted maker from setUp

        address untrustedMaker = makeAddr("untrustedMaker");

        assertTrue(bebopBlendAdapter.isAllowedMaker(trustedMaker), "Trusted maker should be allowed");
        assertFalse(bebopBlendAdapter.isAllowedMaker(untrustedMaker), "Untrusted maker should not be allowed");
    }

    function test_isAllowedMaker_successListIdZero() public {
        // Deploy adapter with list ID 0 (allow any maker)
        IBebopBlendAdapter adapterWithAnyMaker = __deployAdapter({_trustedMakersListId: 0});

        address randomMaker = makeAddr("randomMaker");

        assertTrue(adapterWithAnyMaker.isAllowedMaker(randomMaker), "Any maker should be allowed with list ID 0");
    }
}

contract BebopBlendAdapterEthereumTest is TestBase {
    function setUp() public override {
        setUpMainnetEnvironment();

        __initialize({_makerTokenAddress: ETHEREUM_USDC, _takerTokenAddress: ETHEREUM_WETH});
    }
}

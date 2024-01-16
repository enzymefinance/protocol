// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {IZeroExV4Adapter as IZeroExV4AdapterProd} from
    "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IZeroExV4Adapter.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IZeroExV4} from "tests/interfaces/external/IZeroExV4.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IZeroExV4Adapter} from "tests/interfaces/internal/IZeroExV4Adapter.sol";

address constant ETHEREUM_ZERO_EX_V4_EXCHANGE = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;

abstract contract ZeroExV4AdapterTestBase is IntegrationTest {
    address internal fundOwner;
    address internal maker;
    uint256 makerKey;

    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IZeroExV4Adapter internal zeroExV4Adapter;
    IZeroExV4 internal zeroExV4Exchange;

    IERC20 internal takerAsset;
    IERC20 internal makerAsset;

    EnzymeVersion internal version;

    function setUp(address _zeroExV4Exchange, address _takerAsset, address _makerAsset) internal {
        zeroExV4Exchange = IZeroExV4(_zeroExV4Exchange);
        (maker, makerKey) = makeAddrAndKey("Maker");

        // Deploy an adapter with only the maker as allowed maker
        zeroExV4Adapter = __deployAdapter(toArray(maker));

        takerAsset = IERC20(_takerAsset);
        makerAsset = IERC20(_makerAsset);

        // Create a fund

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Seed the fund with some takerAsset
        increaseTokenBalance({_token: takerAsset, _to: vaultProxyAddress, _amount: assetUnit(takerAsset) * 123});

        // Seed the maker with some makerAsset
        increaseTokenBalance({_token: makerAsset, _to: maker, _amount: assetUnit(makerAsset) * 71});

        // Approve 0xv4 to spend the maker's makerAsset
        vm.prank(maker);
        makerAsset.approve(address(zeroExV4Exchange), type(uint256).max);
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(address[] memory _allowedMakers) private returns (IZeroExV4Adapter adapter_) {
        // Create a new AddressListRegistry list containing the allowedMakers
        uint256 allowedMakersListId = core.persistent.addressListRegistry.createList({
            _owner: makeAddr("ListOwner"),
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.None),
            _initialItems: _allowedMakers
        });

        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(version),
            zeroExV4Exchange,
            core.persistent.addressListRegistry,
            allowedMakersListId
        );
        address addr = deployCode("ZeroExV4Adapter.sol", args);
        return IZeroExV4Adapter(addr);
    }

    // ACTION HELPERS

    function __createLimitOrder(uint128 _makerAmount, uint128 _takerAmount, uint128 _takerFee)
        private
        view
        returns (IZeroExV4.LimitOrder memory order_, IZeroExV4.Signature memory signature_)
    {
        order_ = IZeroExV4.LimitOrder({
            makerToken: address(makerAsset),
            takerToken: address(takerAsset),
            makerAmount: _makerAmount,
            takerAmount: _takerAmount,
            takerTokenFeeAmount: _takerFee,
            maker: maker,
            taker: address(zeroExV4Adapter),
            sender: address(0),
            feeRecipient: maker,
            pool: bytes32(0),
            expiry: uint64(block.timestamp + 1000),
            salt: 0
        });

        bytes32 orderHash = zeroExV4Exchange.getLimitOrderHash(order_);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, orderHash);

        signature_ = IZeroExV4.Signature(IZeroExV4.SignatureType.EIP712, v, r, s);

        return (order_, signature_);
    }

    function __createRfqOrder(uint128 _makerAmount, uint128 _takerAmount)
        private
        view
        returns (IZeroExV4.RfqOrder memory order_, IZeroExV4.Signature memory signature_)
    {
        order_ = IZeroExV4.RfqOrder({
            makerToken: address(makerAsset),
            takerToken: address(takerAsset),
            makerAmount: _makerAmount,
            takerAmount: _takerAmount,
            maker: maker,
            taker: address(zeroExV4Adapter),
            txOrigin: fundOwner,
            pool: bytes32(0),
            expiry: uint64(block.timestamp + 1000),
            salt: 0
        });

        bytes32 orderHash = zeroExV4Exchange.getRfqOrderHash(order_);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, orderHash);

        signature_ = IZeroExV4.Signature(IZeroExV4.SignatureType.EIP712, v, r, s);

        return (order_, signature_);
    }

    function __createOtcOrder(uint128 _makerAmount, uint128 _takerAmount)
        private
        view
        returns (IZeroExV4.OtcOrder memory order_, IZeroExV4.Signature memory signature_)
    {
        // expiryAndNonce logic copied from 0xv4 tests
        // src: https://github.com/0xProject/protocol/blob/development/contracts/zero-ex/tests/forked/RfqtV2Test.t.sol#L150
        uint256 expiry = (block.timestamp + 1000) << 192;
        uint256 bucket = 0 << 128;
        uint256 nonce = vm.getNonce(maker) + 1;
        uint256 expiryAndNonce = expiry | bucket | nonce;
        order_ = IZeroExV4.OtcOrder({
            makerToken: address(makerAsset),
            takerToken: address(takerAsset),
            makerAmount: _makerAmount,
            takerAmount: _takerAmount,
            maker: maker,
            taker: address(zeroExV4Adapter),
            txOrigin: fundOwner,
            expiryAndNonce: expiryAndNonce
        });

        bytes32 orderHash = zeroExV4Exchange.getOtcOrderHash(order_);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, orderHash);

        signature_ = IZeroExV4.Signature(IZeroExV4.SignatureType.EIP712, v, r, s);

        return (order_, signature_);
    }

    function __takeLimitOrder(
        IZeroExV4.LimitOrder memory _order,
        IZeroExV4.Signature memory _signature,
        uint256 _takerAssetFillAmount
    ) private {
        __takeOrder({
            _encodedZeroExOrderArgs: abi.encode(_order, _signature),
            _takerAssetFillAmount: _takerAssetFillAmount,
            _orderType: IZeroExV4AdapterProd.OrderType.Limit
        });
    }

    function __takeRfqOrder(
        IZeroExV4.RfqOrder memory _order,
        IZeroExV4.Signature memory _signature,
        uint256 _takerAssetFillAmount
    ) private {
        __takeOrder({
            _encodedZeroExOrderArgs: abi.encode(_order, _signature),
            _takerAssetFillAmount: _takerAssetFillAmount,
            _orderType: IZeroExV4AdapterProd.OrderType.Rfq
        });
    }

    function __takeOtcOrder(
        IZeroExV4.OtcOrder memory _order,
        IZeroExV4.Signature memory _signature,
        uint256 _takerAssetFillAmount
    ) private {
        __takeOrder({
            _encodedZeroExOrderArgs: abi.encode(_order, _signature),
            _takerAssetFillAmount: _takerAssetFillAmount,
            _orderType: IZeroExV4AdapterProd.OrderType.Otc
        });
    }

    function __takeOrder(
        bytes memory _encodedZeroExOrderArgs,
        uint256 _takerAssetFillAmount,
        IZeroExV4AdapterProd.OrderType _orderType
    ) private {
        bytes memory actionArgs = abi.encode(_encodedZeroExOrderArgs, _takerAssetFillAmount, _orderType);

        vm.prank(fundOwner, fundOwner);

        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _selector: IZeroExV4Adapter.takeOrder.selector,
            _actionArgs: actionArgs,
            _adapterAddress: address(zeroExV4Adapter)
        });
    }

    function test_takeLimitOrder_success() public {
        uint256 takerAssetBalancePre = takerAsset.balanceOf(vaultProxyAddress);
        uint256 takerAmount = takerAssetBalancePre / 5;

        uint256 makerAssetBalancePre = makerAsset.balanceOf(vaultProxyAddress);

        assertNotEq(takerAmount, 0, "Taker amount is 0");

        uint256 makerAmount = assetUnit(makerAsset) * 7;
        (IZeroExV4.LimitOrder memory order, IZeroExV4.Signature memory signature) =
            __createLimitOrder({_makerAmount: uint128(makerAmount), _takerAmount: uint128(takerAmount), _takerFee: 0});

        vm.recordLogs();

        __takeLimitOrder({_order: order, _signature: signature, _takerAssetFillAmount: takerAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(takerAsset)),
            _maxSpendAssetAmounts: toArray(takerAmount),
            _incomingAssets: toArray(address(makerAsset)),
            _minIncomingAssetAmounts: toArray(makerAmount)
        });

        assertEq(
            makerAsset.balanceOf(vaultProxyAddress) - makerAssetBalancePre,
            makerAmount,
            "Mismatch between received and expected maker asset amount"
        );

        assertEq(
            takerAssetBalancePre - takerAsset.balanceOf(vaultProxyAddress),
            takerAmount,
            "Mismatch between sent and expected taker asset amount"
        );
    }

    function test_takeLimitOrder_withFee_success() public {
        uint256 takerAssetBalancePre = takerAsset.balanceOf(vaultProxyAddress);
        uint256 takerAmount = takerAssetBalancePre / 5;

        uint256 makerAssetBalancePre = makerAsset.balanceOf(vaultProxyAddress);

        assertNotEq(takerAmount, 0, "Taker amount is 0");

        uint256 makerAmount = assetUnit(makerAsset) * 7;
        uint256 takerFee = assetUnit(takerAsset) * 7;
        (IZeroExV4.LimitOrder memory order, IZeroExV4.Signature memory signature) = __createLimitOrder({
            _makerAmount: uint128(makerAmount),
            _takerAmount: uint128(takerAmount),
            _takerFee: uint128(takerFee)
        });

        vm.recordLogs();

        __takeLimitOrder({_order: order, _signature: signature, _takerAssetFillAmount: takerAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(takerAsset)),
            _maxSpendAssetAmounts: toArray(takerAmount + takerFee),
            _incomingAssets: toArray(address(makerAsset)),
            _minIncomingAssetAmounts: toArray(makerAmount)
        });

        assertEq(
            makerAsset.balanceOf(vaultProxyAddress) - makerAssetBalancePre,
            makerAmount,
            "Mismatch between received and expected maker asset amount"
        );

        assertEq(
            takerAssetBalancePre - takerAsset.balanceOf(vaultProxyAddress),
            takerAmount + takerFee,
            "Mismatch between sent and expected taker asset amount"
        );
    }

    function test_takeRfqOrder_success() public {
        uint256 takerAssetBalancePre = takerAsset.balanceOf(vaultProxyAddress);
        uint256 takerAmount = takerAssetBalancePre / 5;

        uint256 makerAssetBalancePre = makerAsset.balanceOf(vaultProxyAddress);

        assertNotEq(takerAmount, 0, "Taker amount is 0");

        uint256 makerAmount = assetUnit(makerAsset) * 7;
        (IZeroExV4.RfqOrder memory order, IZeroExV4.Signature memory signature) =
            __createRfqOrder({_makerAmount: uint128(makerAmount), _takerAmount: uint128(takerAmount)});

        vm.recordLogs();

        __takeRfqOrder({_order: order, _signature: signature, _takerAssetFillAmount: takerAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(takerAsset)),
            _maxSpendAssetAmounts: toArray(takerAmount),
            _incomingAssets: toArray(address(makerAsset)),
            _minIncomingAssetAmounts: toArray(makerAmount)
        });

        assertEq(
            makerAsset.balanceOf(vaultProxyAddress) - makerAssetBalancePre,
            makerAmount,
            "Mismatch between received and expected maker asset amount"
        );

        assertEq(
            takerAssetBalancePre - takerAsset.balanceOf(vaultProxyAddress),
            takerAmount,
            "Mismatch between sent and expected taker asset amount"
        );
    }

    function test_takeOtcOrder_success() public {
        uint256 takerAssetBalancePre = takerAsset.balanceOf(vaultProxyAddress);
        uint256 takerAmount = takerAssetBalancePre / 5;

        uint256 makerAssetBalancePre = makerAsset.balanceOf(vaultProxyAddress);

        assertNotEq(takerAmount, 0, "Taker amount is 0");

        uint256 makerAmount = assetUnit(makerAsset) * 7;
        (IZeroExV4.OtcOrder memory order, IZeroExV4.Signature memory signature) =
            __createOtcOrder({_makerAmount: uint128(makerAmount), _takerAmount: uint128(takerAmount)});

        vm.recordLogs();

        __takeOtcOrder({_order: order, _signature: signature, _takerAssetFillAmount: takerAmount});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(takerAsset)),
            _maxSpendAssetAmounts: toArray(takerAmount),
            _incomingAssets: toArray(address(makerAsset)),
            _minIncomingAssetAmounts: toArray(makerAmount)
        });

        assertEq(
            makerAsset.balanceOf(vaultProxyAddress) - makerAssetBalancePre,
            makerAmount,
            "Mismatch between received and expected maker asset amount"
        );

        assertEq(
            takerAssetBalancePre - takerAsset.balanceOf(vaultProxyAddress),
            takerAmount,
            "Mismatch between sent and expected taker asset amount"
        );
    }
}

contract ZeroExV4TestEthereum is ZeroExV4AdapterTestBase {
    function setUp() public virtual override {
        setUpMainnetEnvironment();
        setUp({_zeroExV4Exchange: ETHEREUM_ZERO_EX_V4_EXCHANGE, _takerAsset: ETHEREUM_USDC, _makerAsset: ETHEREUM_WETH});
    }
}

contract ZeroExV4EthereumTestV4 is ZeroExV4TestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

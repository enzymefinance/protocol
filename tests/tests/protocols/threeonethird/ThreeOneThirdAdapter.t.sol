// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {SpendAssetsHandleType} from "tests/utils/core/AdapterUtils.sol";
import {ECDSALib} from "tests/utils/libs/ECDSALib.sol";
import {SignatureLib} from "tests/utils/libs/SignatureLib.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IZeroExV4} from "tests/interfaces/external/IZeroExV4.sol";
import {IThreeOneThird} from "tests/interfaces/external/IThreeOneThird.sol";
import {IThreeOneThirdAdapter} from "tests/interfaces/internal/IThreeOneThirdAdapter.sol";

address constant ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE = 0x1Ee8b39F09C5299526Db65428ab2a8a23ebf08a7;
address constant ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE_OWNER = 0xEC0905eC85e9C8BFD70fd4bB4988488a3c92aB93;
address constant ETHEREUM_ZERO_EX_V4_EXCHANGE = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;

abstract contract ThreeOneThirdAdapterTestBase is IntegrationTest {
    address internal fundOwner;
    address internal tradeSigner;
    uint256 tradeSignerKey;
    address internal maker;
    uint256 makerKey;

    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IThreeOneThirdAdapter internal threeOneThirdAdapter;
    IThreeOneThird internal threeOneThirdBatchTrade;
    IZeroExV4 internal zeroExV4Exchange;

    IERC20 internal takerAsset;
    IERC20 internal makerAsset;

    EnzymeVersion internal version;

    function setUp(
        address _threeOneThirdBatchTrade,
        address _zeroExV4Exchange,
        address _takerAsset,
        address _makerAsset
    ) internal {
        (tradeSigner, tradeSignerKey) = makeAddrAndKey("TradeSigner");

        threeOneThirdBatchTrade = IThreeOneThird(_threeOneThirdBatchTrade);

        // Adapt trade signer
        vm.prank(ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE_OWNER);
        threeOneThirdBatchTrade.updateTradeSigner(tradeSigner);

        // Deploy an adapter
        threeOneThirdAdapter = __deployAdapter();

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Setup 0x RFQ trading functionality
        zeroExV4Exchange = IZeroExV4(_zeroExV4Exchange);

        (maker, makerKey) = makeAddrAndKey("Maker");

        takerAsset = IERC20(_takerAsset);
        makerAsset = IERC20(_makerAsset);

        // Seed the fund with some takerAsset
        increaseTokenBalance({_token: takerAsset, _to: vaultProxyAddress, _amount: assetUnit(takerAsset) * 123});

        // Seed the maker with some makerAsset
        increaseTokenBalance({_token: makerAsset, _to: maker, _amount: assetUnit(makerAsset) * 71});

        // Approve 0xv4 to spend the maker's makerAsset
        vm.prank(maker);
        makerAsset.approve(address(zeroExV4Exchange), type(uint256).max);
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter() private returns (IThreeOneThirdAdapter adapter_) {
        bytes memory args = abi.encode(getIntegrationManagerAddressForVersion(version), threeOneThirdBatchTrade);
        address addr = deployCode("ThreeOneThirdAdapter.sol", args);
        return IThreeOneThirdAdapter(addr);
    }

    // ACTION HELPERS

    function __createZeroExV4RfqOrder(uint128 _makerAmount, uint128 _takerAmount)
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
            taker: address(threeOneThirdBatchTrade),
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

    // TODO: this is just a simple first version with one trade
    function __createBatchTrade(uint128 _makerAmount, uint128 _takerAmount)
        private
        view
        returns (IThreeOneThird.Trade memory)
    {
        (IZeroExV4.RfqOrder memory order, IZeroExV4.Signature memory signature) =
            __createZeroExV4RfqOrder({_makerAmount: uint128(_makerAmount), _takerAmount: uint128(_takerAmount)});

        bytes memory zeroExCalldata =
            abi.encodeWithSelector(zeroExV4Exchange.fillOrKillRfqOrder.selector, order, signature, _takerAmount);

        IThreeOneThird.Trade memory trade_ = IThreeOneThird.Trade({
            exchangeName: "ZeroExExchangeV4",
            from: address(takerAsset),
            fromAmount: _takerAmount,
            to: address(makerAsset),
            minToReceiveBeforeFees: _makerAmount,
            data: zeroExCalldata,
            signature: abi.encode() // placeholder
        });

        return addSignatureToTrade(trade_);
    }

    function addSignatureToTrade(IThreeOneThird.Trade memory _trade)
        internal
        view
        returns (IThreeOneThird.Trade memory)
    {
        bytes32 tradeHash = keccak256(
            abi.encodePacked(
                ETHEREUM_ZERO_EX_V4_EXCHANGE,
                _trade.from,
                _trade.fromAmount,
                _trade.to,
                _trade.minToReceiveBeforeFees,
                _trade.data
            )
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(tradeSignerKey, ECDSALib.toEthSignedMessageHash(tradeHash));
        _trade.signature = SignatureLib.signatureToString(v, r, s);
        return _trade;
    }

    function __takeOrder(IThreeOneThird.Trade[] memory _trades) private {
        bytes memory actionArgs =
            abi.encode(_trades, IThreeOneThird.BatchTradeConfig({checkFeelessWallets: false, revertOnError: true}));

        vm.prank(fundOwner, fundOwner);

        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _selector: IThreeOneThirdAdapter.takeOrder.selector,
            _actionArgs: actionArgs,
            _adapterAddress: address(threeOneThirdAdapter)
        });
    }

    function test_takeBatchTradeRfqOrder_success() public {
        uint256 takerAssetBalancePre = takerAsset.balanceOf(vaultProxyAddress);
        uint256 takerAmount = takerAssetBalancePre / 5;

        uint256 makerAssetBalancePre = makerAsset.balanceOf(vaultProxyAddress);

        assertNotEq(takerAmount, 0, "Taker amount is 0");

        uint256 makerAmount = assetUnit(makerAsset) * 7;

        IThreeOneThird.Trade memory trade =
            __createBatchTrade({_makerAmount: uint128(makerAmount), _takerAmount: uint128(takerAmount)});

        vm.recordLogs();

        IThreeOneThird.Trade[] memory trades_ = new IThreeOneThird.Trade[](1);
        trades_[0] = trade;

        __takeOrder({_trades: trades_});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Transfer,
            _spendAssets: toArray(address(takerAsset)),
            _maxSpendAssetAmounts: toArray(takerAmount),
            _incomingAssets: toArray(address(makerAsset)),
            _minIncomingAssetAmounts: toArray(makerAmount * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000))
        });

        assertEq(
            makerAsset.balanceOf(vaultProxyAddress) - makerAssetBalancePre,
            makerAmount * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount"
        );

        assertEq(
            takerAssetBalancePre - takerAsset.balanceOf(vaultProxyAddress),
            takerAmount,
            "Mismatch between sent and expected taker asset amount"
        );
    }
}

contract ThreeOneThirdTestEthereum is ThreeOneThirdAdapterTestBase {
    function setUp() public virtual override {
        setUpMainnetEnvironment();
        setUp({
            _threeOneThirdBatchTrade: ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE,
            _zeroExV4Exchange: ETHEREUM_ZERO_EX_V4_EXCHANGE,
            _takerAsset: ETHEREUM_USDC,
            _makerAsset: ETHEREUM_WETH
        });
    }
}

contract ThreeOneThirdEthereumTestV4 is ThreeOneThirdTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

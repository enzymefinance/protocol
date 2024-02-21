// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {SpendAssetsHandleType} from "tests/utils/core/AdapterUtils.sol";
import {UniswapV3Utils} from "tests/tests/protocols/uniswap/UniswapV3Utils.sol";
import {ECDSALib} from "tests/utils/libs/ECDSALib.sol";
import {SignatureLib} from "tests/utils/libs/SignatureLib.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IZeroExV4} from "tests/interfaces/external/IZeroExV4.sol";
import {IThreeOneThird} from "tests/interfaces/external/IThreeOneThird.sol";
import {IThreeOneThirdAdapter} from "tests/interfaces/internal/IThreeOneThirdAdapter.sol";

address constant ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE = 0x1Ee8b39F09C5299526Db65428ab2a8a23ebf08a7;
address constant ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE_OWNER = 0xEC0905eC85e9C8BFD70fd4bB4988488a3c92aB93;
address constant ETHEREUM_ZERO_EX_V4_EXCHANGE = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;
uint24 constant ETHEREUM_UNISWAP_V3_FEES_3000 = 3000;

abstract contract ThreeOneThirdAdapterTestBase is IntegrationTest, UniswapV3Utils {
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

    IERC20 internal vaultAsset1;
    IERC20 internal vaultAsset2;
    IERC20 internal externalAsset1;
    IERC20 internal externalAsset2;
    IERC20 internal externalAsset3;

    EnzymeVersion internal version;

    function setUp(
        address _threeOneThirdBatchTrade,
        address _zeroExV4Exchange,
        address _vaultAsset1,
        address _vaultAsset2,
        address _externalAsset1,
        address _externalAsset2,
        address _externalAsset3
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

        vaultAsset1 = IERC20(_vaultAsset1);
        vaultAsset2 = IERC20(_vaultAsset2);
        externalAsset1 = IERC20(_externalAsset1);
        externalAsset2 = IERC20(_externalAsset2);
        externalAsset3 = IERC20(_externalAsset3);

        // Seed the fund with some vaultAsset1,2,3
        increaseTokenBalance({_token: vaultAsset1, _to: vaultProxyAddress, _amount: assetUnit(vaultAsset1) * 123});
        increaseTokenBalance({_token: vaultAsset2, _to: vaultProxyAddress, _amount: assetUnit(vaultAsset2) * 231});

        // Seed the maker with some makerAsset1,2,3
        increaseTokenBalance({_token: externalAsset1, _to: maker, _amount: assetUnit(externalAsset1) * 71});
        increaseTokenBalance({_token: externalAsset2, _to: maker, _amount: assetUnit(externalAsset2) * 61});
        increaseTokenBalance({_token: externalAsset3, _to: maker, _amount: assetUnit(externalAsset3) * 81});

        // Approve 0xv4 to spend the maker's makerAsset1,2,3
        vm.prank(maker);
        externalAsset1.approve(address(zeroExV4Exchange), type(uint256).max);
        vm.prank(maker);
        externalAsset2.approve(address(zeroExV4Exchange), type(uint256).max);
        vm.prank(maker);
        externalAsset3.approve(address(zeroExV4Exchange), type(uint256).max);
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter() private returns (IThreeOneThirdAdapter adapter_) {
        bytes memory args = abi.encode(getIntegrationManagerAddressForVersion(version), threeOneThirdBatchTrade);
        address addr = deployCode("ThreeOneThirdAdapter.sol", args);
        return IThreeOneThirdAdapter(addr);
    }

    // ACTION HELPERS

    function __createZeroExV4RfqOrderBatchTrade(
        IERC20 _makerAsset,
        uint128 _makerAmount,
        IERC20 _takerAsset,
        uint128 _takerAmount
    ) private view returns (IThreeOneThird.Trade memory) {
        (IZeroExV4.RfqOrder memory order, IZeroExV4.Signature memory signature) = __createZeroExV4RfqOrder({
            _makerAsset: _makerAsset,
            _makerAmount: uint128(_makerAmount),
            _takerAsset: _takerAsset,
            _takerAmount: uint128(_takerAmount)
        });

        bytes memory zeroExCalldata =
            abi.encodeWithSelector(zeroExV4Exchange.fillOrKillRfqOrder.selector, order, signature, _takerAmount);

        IThreeOneThird.Trade memory trade_ = IThreeOneThird.Trade({
            exchangeName: "ZeroExExchangeV4",
            from: address(_takerAsset),
            fromAmount: _takerAmount,
            to: address(_makerAsset),
            minToReceiveBeforeFees: _makerAmount,
            data: zeroExCalldata,
            signature: abi.encode() // placeholder
        });

        return addSignatureToTrade(trade_);
    }

    function __createZeroExV4RfqOrder(
        IERC20 _makerAsset,
        uint128 _makerAmount,
        IERC20 _takerAsset,
        uint128 _takerAmount
    ) private view returns (IZeroExV4.RfqOrder memory order_, IZeroExV4.Signature memory signature_) {
        order_ = IZeroExV4.RfqOrder({
            makerToken: address(_makerAsset),
            takerToken: address(_takerAsset),
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

    function __createZeroExV4UniswapV3BatchTrade(IERC20 _sellAsset, uint128 _sellAmount, IERC20 _buyAsset)
        private
        view
        returns (IThreeOneThird.Trade memory)
    {
        bytes memory encodedPath =
            abi.encodePacked(address(_sellAsset), ETHEREUM_UNISWAP_V3_FEES_3000, address(_buyAsset));

        address poolAddress = getPool(address(_sellAsset), address(_buyAsset), ETHEREUM_UNISWAP_V3_FEES_3000);
        uint256 price = uniswapV3CalcPoolPriceInvertIfNeeded(poolAddress, address(_sellAsset));

        // normalize sellAmount; add 1% slippage
        uint256 minBuyAmount = price * _sellAmount / assetUnit(_sellAsset) * 99 / 100;

        bytes memory zeroExCalldata = abi.encodeWithSelector(
            zeroExV4Exchange.sellTokenForTokenToUniswapV3.selector, encodedPath, _sellAmount, minBuyAmount, address(0)
        );

        IThreeOneThird.Trade memory trade_ = IThreeOneThird.Trade({
            exchangeName: "ZeroExExchangeV4",
            from: address(_sellAsset),
            fromAmount: _sellAmount,
            to: address(_buyAsset),
            minToReceiveBeforeFees: minBuyAmount,
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

    // TESTS

    function test_takeBatchTradeRfqOrder_success() public {
        uint256 vaultAssetBalancePre = vaultAsset1.balanceOf(vaultProxyAddress);
        uint256 fromAmount = vaultAssetBalancePre / 5;
        assertNotEq(fromAmount, 0, "From amount is 0");

        uint256 externalAssetBalancePre = externalAsset1.balanceOf(vaultProxyAddress);
        uint256 toAmount = assetUnit(externalAsset1) * 7;

        IThreeOneThird.Trade memory trade = __createZeroExV4RfqOrderBatchTrade({
            _makerAsset: externalAsset1,
            _makerAmount: uint128(toAmount),
            _takerAsset: vaultAsset1,
            _takerAmount: uint128(fromAmount)
        });

        vm.recordLogs();

        IThreeOneThird.Trade[] memory trades_ = new IThreeOneThird.Trade[](1);
        trades_[0] = trade;

        __takeOrder({_trades: trades_});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Transfer,
            _spendAssets: toArray(address(vaultAsset1)),
            _maxSpendAssetAmounts: toArray(fromAmount),
            _incomingAssets: toArray(address(externalAsset1)),
            _minIncomingAssetAmounts: toArray(toAmount * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000))
        });

        assertEq(
            externalAsset1.balanceOf(vaultProxyAddress) - externalAssetBalancePre,
            toAmount * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount"
        );

        assertEq(
            vaultAssetBalancePre - vaultAsset1.balanceOf(vaultProxyAddress),
            fromAmount,
            "Mismatch between sent and expected taker asset amount"
        );
    }

    function test_takeBatchTradeRfqOrders_success() public {
        uint256 vaultAsset1BalancePre = vaultAsset1.balanceOf(vaultProxyAddress);
        uint256 fromAmount1 = vaultAsset1BalancePre / 5;
        uint256 vaultAsset2BalancePre = vaultAsset2.balanceOf(vaultProxyAddress);
        uint256 fromAmount2 = vaultAsset2BalancePre / 5;
        assertNotEq(fromAmount1, 0, "From amount 1 is 0");
        assertNotEq(fromAmount2, 0, "From amount 2 is 0");

        uint256 externalAsset1BalancePre = externalAsset1.balanceOf(vaultProxyAddress);
        uint256 toAmount1 = assetUnit(externalAsset1) * 7;
        uint256 externalAsset2BalancePre = externalAsset2.balanceOf(vaultProxyAddress);
        uint256 toAmount2 = assetUnit(externalAsset2) * 7;

        IThreeOneThird.Trade memory trade1 = __createZeroExV4RfqOrderBatchTrade({
            _makerAsset: externalAsset1,
            _makerAmount: uint128(toAmount1),
            _takerAsset: vaultAsset1,
            _takerAmount: uint128(fromAmount1)
        });
        IThreeOneThird.Trade memory trade2 = __createZeroExV4RfqOrderBatchTrade({
            _makerAsset: externalAsset2,
            _makerAmount: uint128(toAmount2),
            _takerAsset: vaultAsset2,
            _takerAmount: uint128(fromAmount2)
        });

        vm.recordLogs();

        IThreeOneThird.Trade[] memory trades_ = new IThreeOneThird.Trade[](2);
        trades_[0] = trade1;
        trades_[1] = trade2;

        __takeOrder({_trades: trades_});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Transfer,
            _spendAssets: toArray(address(vaultAsset1), address(vaultAsset2)),
            _maxSpendAssetAmounts: toArray(fromAmount1, fromAmount2),
            _incomingAssets: toArray(address(externalAsset1), address(externalAsset2)),
            _minIncomingAssetAmounts: toArray(
                toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
                toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000)
                )
        });

        assertEq(
            externalAsset1.balanceOf(vaultProxyAddress) - externalAsset1BalancePre,
            toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount (Trade 1)"
        );

        assertEq(
            vaultAsset1BalancePre - vaultAsset1.balanceOf(vaultProxyAddress),
            fromAmount1,
            "Mismatch between sent and expected taker asset amount (Trade 1)"
        );

        assertEq(
            externalAsset2.balanceOf(vaultProxyAddress) - externalAsset2BalancePre,
            toAmount2 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount (Trade 2)"
        );

        assertEq(
            vaultAsset2BalancePre - vaultAsset2.balanceOf(vaultProxyAddress),
            fromAmount2,
            "Mismatch between sent and expected taker asset amount (Trade 2)"
        );
    }

    function test_takeBatchTradeRfqOrdersAndUniswapV3_success() public {
        uint256 vaultAsset1BalancePre = vaultAsset1.balanceOf(vaultProxyAddress);
        uint256 fromAmount1 = vaultAsset1BalancePre / 5;
        uint256 vaultAsset2BalancePre = vaultAsset2.balanceOf(vaultProxyAddress);
        uint256 fromAmount2 = vaultAsset2BalancePre / 5;
        uint256 fromAmount3 = vaultAsset2BalancePre / 5;
        assertNotEq(fromAmount1, 0, "From amount 1 is 0");
        assertNotEq(fromAmount2, 0, "From amount 2 is 0");
        assertNotEq(fromAmount3, 0, "From amount 3 is 0");

        uint256 externalAsset1BalancePre = externalAsset1.balanceOf(vaultProxyAddress);
        uint256 toAmount1 = assetUnit(externalAsset1) * 7;
        uint256 externalAsset2BalancePre = externalAsset2.balanceOf(vaultProxyAddress);
        uint256 toAmount2 = assetUnit(externalAsset2) * 7;
        uint256 externalAsset3BalancePre = externalAsset3.balanceOf(vaultProxyAddress);
        uint256 toAmount3; // use minToReceiveBeforeFees from trade3

        IThreeOneThird.Trade[] memory trades_ = new IThreeOneThird.Trade[](3);

        // Scope trade creation to avoid "stack too deep" issue (max 16 local vars)
        {
            IThreeOneThird.Trade memory trade1 = __createZeroExV4RfqOrderBatchTrade({
                _makerAsset: externalAsset1,
                _makerAmount: uint128(toAmount1),
                _takerAsset: vaultAsset1,
                _takerAmount: uint128(fromAmount1)
            });
            IThreeOneThird.Trade memory trade2 = __createZeroExV4RfqOrderBatchTrade({
                _makerAsset: externalAsset2,
                _makerAmount: uint128(toAmount2),
                _takerAsset: vaultAsset2,
                _takerAmount: uint128(fromAmount2)
            });
            IThreeOneThird.Trade memory trade3 = __createZeroExV4UniswapV3BatchTrade({
                _sellAsset: vaultAsset2,
                _sellAmount: uint128(fromAmount3),
                _buyAsset: externalAsset3
            });

            trades_[0] = trade1;
            trades_[1] = trade2;
            trades_[2] = trade3;
            toAmount3 = trade3.minToReceiveBeforeFees;
        }

        vm.recordLogs();

        __takeOrder({_trades: trades_});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Transfer,
            _spendAssets: toArray(address(vaultAsset1), address(vaultAsset2)), // Trade 2 and 3 spends asset2
            _maxSpendAssetAmounts: toArray(fromAmount1, fromAmount2 + fromAmount3),
            _incomingAssets: toArray(address(externalAsset1), address(externalAsset2), address(externalAsset3)),
            _minIncomingAssetAmounts: toArray(
                toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
                toAmount2 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
                toAmount3 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000)
                )
        });

        assertEq(
            externalAsset1.balanceOf(vaultProxyAddress) - externalAsset1BalancePre,
            toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount (Trade 1)"
        );

        assertEq(
            vaultAsset1BalancePre - vaultAsset1.balanceOf(vaultProxyAddress),
            fromAmount1,
            "Mismatch between sent and expected taker asset amount (Trade 1)"
        );

        assertEq(
            externalAsset2.balanceOf(vaultProxyAddress) - externalAsset2BalancePre,
            toAmount2 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount (Trade 2)"
        );

        assertEq(
            vaultAsset2BalancePre - vaultAsset2.balanceOf(vaultProxyAddress),
            fromAmount2 + fromAmount3,
            "Mismatch between sent and expected taker asset amount (Trade 2 + 3)"
        );

        assertGt(
            externalAsset3.balanceOf(vaultProxyAddress) - externalAsset3BalancePre,
            toAmount3 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount (Trade 3)"
        );
    }

    function test_takeBatchTradeDependentTrades_success() public {
        // Dependent trades
        // 1: asset1 -> asset2
        // 2: asset2 -> asset3
        //      sell amount of asset 2 is bigger then vault holdings pre batch trade

        uint256 vaultAsset1BalancePre = vaultAsset1.balanceOf(vaultProxyAddress);
        uint256 fromAmount1 = vaultAsset1BalancePre / 5;
        uint256 vaultAsset2BalancePre = vaultAsset2.balanceOf(vaultProxyAddress);
        uint256 fromAmount2 = vaultAsset2BalancePre + 1;
        assertNotEq(fromAmount1, 0, "From amount 1 is 0");
        assertNotEq(fromAmount2, 0, "From amount 2 is 0");

        //        uint256 externalAsset1BalancePre = externalAsset1.balanceOf(vaultProxyAddress);
        uint256 toAmount1; // use minToReceiveBeforeFees from trade1
        uint256 externalAsset2BalancePre = externalAsset2.balanceOf(vaultProxyAddress);
        uint256 toAmount2; // use minToReceiveBeforeFees from trade2

        IThreeOneThird.Trade[] memory trades_ = new IThreeOneThird.Trade[](2);

        // Scope trade creation to avoid "stack too deep" issue (max 16 local vars)
        {
            IThreeOneThird.Trade memory trade1 = __createZeroExV4UniswapV3BatchTrade({
                _sellAsset: vaultAsset1,
                _sellAmount: uint128(fromAmount1),
                _buyAsset: vaultAsset2
            });
            IThreeOneThird.Trade memory trade2 = __createZeroExV4UniswapV3BatchTrade({
                _sellAsset: vaultAsset2,
                _sellAmount: uint128(fromAmount2),
                _buyAsset: externalAsset2
            });

            trades_[0] = trade1;
            trades_[1] = trade2;
            toAmount1 = trade1.minToReceiveBeforeFees;
            toAmount2 = trade2.minToReceiveBeforeFees;
        }

        vm.recordLogs();

        __takeOrder({_trades: trades_});

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleType: SpendAssetsHandleType.Transfer,
            _spendAssets: toArray(address(vaultAsset1), address(vaultAsset2)),
            _maxSpendAssetAmounts: toArray(
                fromAmount1, fromAmount2 - toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000)
                ),
            _incomingAssets: toArray(address(externalAsset2)),
            _minIncomingAssetAmounts: toArray(toAmount2 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000))
        });

        assertEq(
            vaultAsset1BalancePre - vaultAsset1.balanceOf(vaultProxyAddress),
            fromAmount1,
            "Mismatch between sent and expected taker asset amount (Trade 1)"
        );

        // asset2 is bought in trade 1; the pre trade vault balance of asset2 + 1 is sold in trade 2
        assertEq(
            vaultAsset2.balanceOf(vaultProxyAddress),
            toAmount1 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000) - 1,
            "Mismatch between received and expected asset amount (Trade 1 incoming; Trade 2 spend)"
        );

        assertGt(
            externalAsset2.balanceOf(vaultProxyAddress) - externalAsset2BalancePre,
            toAmount2 * (10000 - threeOneThirdBatchTrade.feeBasisPoints()) / (10000),
            "Mismatch between received and expected maker asset amount (Trade 2)"
        );
    }
}

contract ThreeOneThirdTestEthereum is ThreeOneThirdAdapterTestBase {
    function setUp() public virtual override {
        setUpMainnetEnvironment();
        setUp({
            _threeOneThirdBatchTrade: ETHEREUM_THREE_ONE_THIRD_BATCH_TRADE,
            _zeroExV4Exchange: ETHEREUM_ZERO_EX_V4_EXCHANGE,
            _vaultAsset1: ETHEREUM_USDC,
            _vaultAsset2: ETHEREUM_USDT,
            _externalAsset1: ETHEREUM_WETH,
            _externalAsset2: ETHEREUM_CRV,
            _externalAsset3: ETHEREUM_LINK
        });
    }
}

contract ThreeOneThirdEthereumTestV4 is ThreeOneThirdTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

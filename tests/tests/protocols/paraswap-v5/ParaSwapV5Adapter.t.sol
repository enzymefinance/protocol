// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {IParaSwapV5Adapter as IParaSwapV5AdapterProd} from
    "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IParaSwapV5Adapter.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IUniswapV2Pair} from "tests/interfaces/external/IUniswapV2Pair.sol";
import {IParaSwapV5AugustusSwapper} from "tests/interfaces/external/IParaSwapV5AugustusSwapper.sol";
import {IParaSwapV5Adapter} from "tests/interfaces/internal/IParaSwapV5Adapter.sol";

address constant ETHEREUM_PARASWAP_V5_AUGUSTUS_SWAPPER = 0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57;
address constant ETHEREUM_PARASWAP_V5_TOKEN_TRANSFER_PROXY = 0x216B4B4Ba9F3e719726886d34a177484278Bfcae;

address constant ETHEREUM_UNISWAP_DAI_WETH_POOL_ADDRESS = 0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11;
address constant ETHEREUM_UNISWAP_USDC_USDT_POOL_ADDRESS = 0x3041CbD36888bECc7bbCBc0045E3B1f144466f5f;
address constant ETHEREUM_SUSHI_DAI_WETH_POOL_ADDRESS = 0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f;

address constant ETHEREUM_PARASWAP_V5_UNIV2_FORK_ADAPTER = 0x3A0430bF7cd2633af111ce3204DB4b0990857a6F;
uint256 constant ETHEREUM_PARASWAP_V5_UNIV2_FORK_INDEX = 4;

abstract contract ParaSwapV5AdapterBaseTest is IntegrationTest {
    event MultipleOrdersItemFailed(uint256 index, bytes reason);

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IParaSwapV5Adapter internal adapter;
    IERC20 internal outgoingAsset1;
    IERC20 internal incomingAsset1;
    IERC20 internal outgoingAsset2;
    IERC20 internal incomingAsset2;

    IUniswapV2Pair internal uniswapPool1;
    IUniswapV2Pair internal uniswapPool2;
    IUniswapV2Pair internal sushiPool1;

    UniswapV2Payload internal uniswapPayload1;
    UniswapV2Payload internal uniswapPayload2;
    UniswapV2Payload internal sushiPayload1;

    EnzymeVersion internal version;

    struct UniswapV2Payload {
        address weth;
        uint256[] pools;
    }

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        address _augustSwapperAddress,
        address _tokenTransferProxyAddress,
        address _uniswapPoolAddress1,
        address _uniswapPoolAddress2,
        address _sushiPoolAddress1
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        version = _version;

        adapter = __deployAdapter({
            _augustusSwapper: _augustSwapperAddress,
            _tokenTransferProxy: _tokenTransferProxyAddress,
            _feePartner: address(0),
            _feePercent: 0
        });

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        uniswapPool1 = IUniswapV2Pair(_uniswapPoolAddress1);
        uniswapPool2 = IUniswapV2Pair(_uniswapPoolAddress2);
        sushiPool1 = IUniswapV2Pair(_sushiPoolAddress1);

        uniswapPayload1 = __paraSwapV5ConstructUniV2ForkPayload({_pool: uniswapPool1});
        uniswapPayload2 = __paraSwapV5ConstructUniV2ForkPayload({_pool: uniswapPool2});
        sushiPayload1 = __paraSwapV5ConstructUniV2ForkPayload({_pool: sushiPool1});

        outgoingAsset1 = IERC20(uniswapPool1.token0());
        incomingAsset1 = IERC20(uniswapPool1.token1());
        outgoingAsset2 = IERC20(uniswapPool2.token0());
        incomingAsset2 = IERC20(uniswapPool2.token1());

        // Ensure that all assets are registered
        addPrimitivesWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddresses: (
                toArray(address(outgoingAsset1), address(outgoingAsset2), address(incomingAsset1), address(incomingAsset2))
            ),
            _skipIfRegistered: true
        });

        // Seed the fund with the outgoing assets
        increaseTokenBalance({_token: outgoingAsset1, _to: vaultProxyAddress, _amount: assetUnit(outgoingAsset1) * 123});
        increaseTokenBalance({_token: outgoingAsset2, _to: vaultProxyAddress, _amount: assetUnit(outgoingAsset2) * 234});
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(
        address _augustusSwapper,
        address _tokenTransferProxy,
        address _feePartner,
        uint256 _feePercent
    ) private returns (IParaSwapV5Adapter) {
        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(version),
            _augustusSwapper,
            _tokenTransferProxy,
            _feePartner,
            _feePercent
        );
        address addr = deployCode("ParaSwapV5Adapter.sol", args);
        return IParaSwapV5Adapter(addr);
    }

    // ACTION HELPERS

    function __takeOrder(
        uint256 _minIncomingAssetAmount,
        uint256 _expectedIncomingAssetAmount,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        IParaSwapV5AdapterProd.SwapType _swapType,
        bytes memory _swapData
    ) private {
        bytes memory actionArgs = __encodeTakeOrderArgs({
            _minIncomingAssetAmount: _minIncomingAssetAmount,
            _expectedIncomingAssetAmount: _expectedIncomingAssetAmount,
            _outgoingAsset: _outgoingAsset,
            _outgoingAssetAmount: _outgoingAssetAmount,
            _swapType: _swapType,
            _swapData: _swapData
        });
        vm.prank(fundOwner);

        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(adapter),
            _selector: IParaSwapV5Adapter.takeOrder.selector
        });
    }

    function __takeMultipleOrders(bytes[] memory _ordersData, bool _allowOrdersToFail) private {
        bytes memory actionArgs = abi.encode(_ordersData, _allowOrdersToFail);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(adapter),
            _selector: IParaSwapV5Adapter.takeMultipleOrders.selector
        });
    }

    // MISC HELPERS

    function __encodeMegaSwapData(IParaSwapV5AugustusSwapper.MegaSwapPath[] memory _path)
        private
        pure
        returns (bytes memory swapData_)
    {
        return abi.encode(_path);
    }

    function __encodeMultiSwapData(IParaSwapV5AugustusSwapper.Path[] memory _path)
        private
        pure
        returns (bytes memory swapData_)
    {
        return abi.encode(_path);
    }

    function __encodeSimpleSwapData(IParaSwapV5AdapterProd.SimpleSwapParams memory _simpleSwapParams)
        private
        pure
        returns (bytes memory swapData_)
    {
        return abi.encode(_simpleSwapParams);
    }

    function __encodeTakeOrderArgs(
        uint256 _minIncomingAssetAmount,
        uint256 _expectedIncomingAssetAmount,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        IParaSwapV5AdapterProd.SwapType _swapType,
        bytes memory _swapData
    ) private pure returns (bytes memory encodedTakeOrderArgs_) {
        encodedTakeOrderArgs_ = abi.encode(
            _minIncomingAssetAmount,
            _expectedIncomingAssetAmount,
            _outgoingAsset,
            _outgoingAssetAmount,
            bytes16(0),
            _swapType,
            _swapData
        );

        return encodedTakeOrderArgs_;
    }

    function __paraSwapV5ConstructUniV2ForkPayload(IUniswapV2Pair _pool)
        private
        pure
        returns (UniswapV2Payload memory uniswapPayload_)
    {
        // Construct each `pools` value by packing a uint256 so that:
        // pool address = bits 1-159
        // direction (`1` if the incoming token is `token0` on the pool) = bit 160
        // fee (`30` for all Uni forks) = bits 161+
        // e.g., hex((30 << 161) + (1 << 160) + 0xa478c2975ab1ea89e8196811f51a7b7ade33eb11)

        uint256 fee = 30;
        uint256 poolValue = (fee << 161) + (0 << 160) + uint256((uint160(address(_pool))));

        UniswapV2Payload memory uniswapV2Payload = UniswapV2Payload({weth: address(0), pools: toArray(poolValue)});

        return uniswapV2Payload;
    }

    function __paraSwapV5ConstructUniV2ForkPaths(
        address _incomingAssetAddress,
        UniswapV2Payload[] memory _payloads,
        uint256[] memory _percents
    ) private pure returns (IParaSwapV5AugustusSwapper.Path[] memory paths_) {
        IParaSwapV5AugustusSwapper.Route[] memory routes = new IParaSwapV5AugustusSwapper.Route[](_payloads.length);
        for (uint256 i = 0; i < _payloads.length; i++) {
            routes[i] = IParaSwapV5AugustusSwapper.Route({
                index: ETHEREUM_PARASWAP_V5_UNIV2_FORK_INDEX,
                targetExchange: address(0),
                percent: _percents[i],
                payload: abi.encode(_payloads[i]),
                networkFee: 0
            });
        }

        IParaSwapV5AugustusSwapper.Adapter[] memory adapters = new IParaSwapV5AugustusSwapper.Adapter[](1);
        adapters[0] = IParaSwapV5AugustusSwapper.Adapter({
            adapter: payable(ETHEREUM_PARASWAP_V5_UNIV2_FORK_ADAPTER),
            percent: BPS_ONE_HUNDRED_PERCENT,
            networkFee: 0,
            route: routes
        });

        paths_ = new IParaSwapV5AugustusSwapper.Path[](1);
        paths_[0] = IParaSwapV5AugustusSwapper.Path({to: _incomingAssetAddress, totalNetworkFee: 0, adapters: adapters});

        return paths_;
    }

    // TESTS

    function test_takeOrder_successSimpleSwap() public {
        uint256 preOrderOutgoingAssetBalance = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance = incomingAsset1.balanceOf(vaultProxyAddress);
        uint256 outgoingAssetAmount = preOrderOutgoingAssetBalance / 333;

        // Data fetched from a ParaSwapV5 API query: https://app.swaggerhub.com/apis/paraswapv5/api/1.0#/prices/get_prices
        IParaSwapV5AdapterProd.SimpleSwapParams memory simpleSwapParams = IParaSwapV5AdapterProd.SimpleSwapParams({
            incomingAsset: address(incomingAsset1),
            callees: toArray(0xF9234CB08edb93c0d4a4d4c70cC3FfD070e78e07),
            exchangeData: hex"91a32b690000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000520437c042bdafc0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000004de4a478c2975ab1ea89e8196811f51a7b7ade33eb11",
            startIndexes: toArray(0, 228),
            values: toArray(uint256(0))
        });

        bytes memory swapData = __encodeSimpleSwapData({_simpleSwapParams: simpleSwapParams});

        vm.recordLogs();

        __takeOrder({
            _minIncomingAssetAmount: 1,
            _expectedIncomingAssetAmount: 1,
            _outgoingAsset: address(outgoingAsset1),
            _outgoingAssetAmount: outgoingAssetAmount,
            _swapType: IParaSwapV5AdapterProd.SwapType.Simple,
            _swapData: swapData
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(outgoingAsset1)),
            _maxSpendAssetAmounts: toArray(outgoingAssetAmount),
            _incomingAssets: toArray(address(incomingAsset1)),
            _minIncomingAssetAmounts: toArray(uint256(1))
        });

        uint256 postOrderOutgoingAssetBalance = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 postOrderIncomingAssetBalance = incomingAsset1.balanceOf(vaultProxyAddress);

        assertEq(
            postOrderOutgoingAssetBalance,
            preOrderOutgoingAssetBalance - outgoingAssetAmount,
            "Incorrect outgoing asset balance"
        );
        assertGt(postOrderIncomingAssetBalance, preOrderIncomingAssetBalance, "Incorrect incoming asset balance");
    }

    function test_takeOrder_successMultiSwap() public {
        uint256 preOrderOutgoingAssetBalance = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance = incomingAsset1.balanceOf(vaultProxyAddress);

        uint256 outgoingAssetAmount = preOrderOutgoingAssetBalance / 7;

        UniswapV2Payload[] memory payloads = new UniswapV2Payload[](2);
        payloads[0] = uniswapPayload1;
        payloads[1] = sushiPayload1;

        uint256 fiftyPercent = BPS_ONE_HUNDRED_PERCENT / 2;
        uint256[] memory percents = new uint256[](2);
        percents[0] = fiftyPercent;
        percents[1] = fiftyPercent;

        bytes memory swapData = __encodeMultiSwapData({
            _path: __paraSwapV5ConstructUniV2ForkPaths({
                _incomingAssetAddress: address(incomingAsset1),
                _payloads: payloads,
                _percents: percents
            })
        });

        vm.recordLogs();

        __takeOrder({
            _minIncomingAssetAmount: 1,
            _expectedIncomingAssetAmount: 1,
            _outgoingAsset: address(outgoingAsset1),
            _outgoingAssetAmount: outgoingAssetAmount,
            _swapType: IParaSwapV5AdapterProd.SwapType.Multi,
            _swapData: swapData
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(outgoingAsset1)),
            _maxSpendAssetAmounts: toArray(outgoingAssetAmount),
            _incomingAssets: toArray(address(incomingAsset1)),
            _minIncomingAssetAmounts: toArray(uint256(1))
        });

        uint256 postOrderOutgoingAssetBalance = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 postOrderIncomingAssetBalance = incomingAsset1.balanceOf(vaultProxyAddress);

        assertEq(
            postOrderOutgoingAssetBalance,
            preOrderOutgoingAssetBalance - outgoingAssetAmount,
            "Incorrect outgoing asset balance"
        );
        assertGt(postOrderIncomingAssetBalance, preOrderIncomingAssetBalance, "Incorrect incoming asset balance");
    }

    function test_takeOrder_successMegaSwap() public {
        uint256 preOrderOutgoingAssetBalance = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance = incomingAsset1.balanceOf(vaultProxyAddress);

        uint256 outgoingAssetAmount = preOrderOutgoingAssetBalance / 7;

        UniswapV2Payload[] memory payloads = new UniswapV2Payload[](2);
        payloads[0] = uniswapPayload1;
        payloads[1] = sushiPayload1;

        uint256 fiftyPercent = BPS_ONE_HUNDRED_PERCENT / 2;
        uint256[] memory percents = new uint256[](2);
        percents[0] = fiftyPercent;
        percents[1] = fiftyPercent;

        IParaSwapV5AugustusSwapper.Path[] memory multiSwapPath = __paraSwapV5ConstructUniV2ForkPaths({
            _incomingAssetAddress: address(incomingAsset1),
            _payloads: payloads,
            _percents: percents
        });

        IParaSwapV5AugustusSwapper.MegaSwapPath[] memory megaSwapPath = new IParaSwapV5AugustusSwapper.MegaSwapPath[](2);
        megaSwapPath[0] =
            IParaSwapV5AugustusSwapper.MegaSwapPath({fromAmountPercent: fiftyPercent, path: multiSwapPath});
        megaSwapPath[1] =
            IParaSwapV5AugustusSwapper.MegaSwapPath({fromAmountPercent: fiftyPercent, path: multiSwapPath});

        bytes memory swapData = __encodeMegaSwapData({_path: megaSwapPath});

        vm.recordLogs();

        __takeOrder({
            _minIncomingAssetAmount: 1,
            _expectedIncomingAssetAmount: 1,
            _outgoingAsset: address(outgoingAsset1),
            _outgoingAssetAmount: outgoingAssetAmount,
            _swapType: IParaSwapV5AdapterProd.SwapType.Mega,
            _swapData: swapData
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(outgoingAsset1)),
            _maxSpendAssetAmounts: toArray(outgoingAssetAmount),
            _incomingAssets: toArray(address(incomingAsset1)),
            _minIncomingAssetAmounts: toArray(uint256(1))
        });

        uint256 postOrderOutgoingAssetBalance = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 postOrderIncomingAssetBalance = incomingAsset1.balanceOf(vaultProxyAddress);

        assertEq(
            postOrderOutgoingAssetBalance,
            preOrderOutgoingAssetBalance - outgoingAssetAmount,
            "Incorrect outgoing asset balance"
        );
        assertGt(postOrderIncomingAssetBalance, preOrderIncomingAssetBalance, "Incorrect incoming asset balance");
    }

    function test_takeMultipleOrders_success() public {
        uint256 preOrderOutgoingAssetBalance1 = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance1 = incomingAsset1.balanceOf(vaultProxyAddress);
        uint256 outgoingAssetAmount1 = preOrderOutgoingAssetBalance1 / 7;

        uint256 preOrderOutgoingAssetBalance2 = outgoingAsset2.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance2 = incomingAsset2.balanceOf(vaultProxyAddress);
        uint256 outgoingAssetAmount2 = preOrderOutgoingAssetBalance2 / 7;

        {
            UniswapV2Payload[] memory payload1 = new UniswapV2Payload[](1);
            payload1[0] = uniswapPayload1;

            UniswapV2Payload[] memory payload2 = new UniswapV2Payload[](1);
            payload2[0] = uniswapPayload2;

            bytes memory swapData1 = __encodeMultiSwapData({
                _path: __paraSwapV5ConstructUniV2ForkPaths({
                    _incomingAssetAddress: address(incomingAsset1),
                    _payloads: payload1,
                    _percents: toArray(BPS_ONE_HUNDRED_PERCENT)
                })
            });

            bytes memory swapData2 = __encodeMultiSwapData({
                _path: __paraSwapV5ConstructUniV2ForkPaths({
                    _incomingAssetAddress: address(incomingAsset2),
                    _payloads: payload2,
                    _percents: toArray(BPS_ONE_HUNDRED_PERCENT)
                })
            });

            bytes[] memory encodedTakeOrderArgs = new bytes[](2);

            encodedTakeOrderArgs[0] = __encodeTakeOrderArgs({
                _minIncomingAssetAmount: 1,
                _expectedIncomingAssetAmount: 1,
                _outgoingAsset: address(outgoingAsset1),
                _outgoingAssetAmount: outgoingAssetAmount1,
                _swapType: IParaSwapV5AdapterProd.SwapType.Multi,
                _swapData: swapData1
            });

            encodedTakeOrderArgs[1] = __encodeTakeOrderArgs({
                _minIncomingAssetAmount: 1,
                _expectedIncomingAssetAmount: 1,
                _outgoingAsset: address(outgoingAsset2),
                _outgoingAssetAmount: outgoingAssetAmount2,
                _swapType: IParaSwapV5AdapterProd.SwapType.Multi,
                _swapData: swapData2
            });

            vm.recordLogs();

            __takeMultipleOrders({_ordersData: encodedTakeOrderArgs, _allowOrdersToFail: false});

            assertAdapterAssetsForAction({
                _logs: vm.getRecordedLogs(),
                _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
                _spendAssets: toArray(address(outgoingAsset1), address(outgoingAsset2)),
                _maxSpendAssetAmounts: toArray(outgoingAssetAmount1, outgoingAssetAmount2),
                _incomingAssets: toArray(address(incomingAsset1), address(incomingAsset2)),
                _minIncomingAssetAmounts: toArray(uint256(0), uint256(0))
            });
        }

        {
            uint256 postOrderOutgoingAssetBalance1 = outgoingAsset1.balanceOf(vaultProxyAddress);
            uint256 postOrderIncomingAssetBalance1 = incomingAsset1.balanceOf(vaultProxyAddress);
            uint256 postOrderOutgoingAssetBalance2 = outgoingAsset2.balanceOf(vaultProxyAddress);
            uint256 postOrderIncomingAssetBalance2 = incomingAsset2.balanceOf(vaultProxyAddress);

            assertEq(
                postOrderOutgoingAssetBalance1,
                preOrderOutgoingAssetBalance1 - outgoingAssetAmount1,
                "Incorrect outgoing asset balance for order 1"
            );
            assertGt(
                postOrderIncomingAssetBalance1,
                preOrderIncomingAssetBalance1,
                "Incorrect incoming asset balance for order 1"
            );

            assertEq(
                postOrderOutgoingAssetBalance2,
                preOrderOutgoingAssetBalance2 - outgoingAssetAmount2,
                "Incorrect outgoing asset balance for order 2"
            );
            assertGt(
                postOrderIncomingAssetBalance2,
                preOrderIncomingAssetBalance2,
                "Incorrect incoming asset balance for order 2"
            );
        }
    }

    function __test_takeMultipleOrders_oneOrderFails(bool _allowOrdersToFail) private {
        uint256 preOrderOutgoingAssetBalance1 = outgoingAsset1.balanceOf(vaultProxyAddress);
        uint256 outgoingAssetAmount1 = preOrderOutgoingAssetBalance1 / 7;
        uint256 preOrderOutgoingAssetBalance2 = outgoingAsset2.balanceOf(vaultProxyAddress);
        uint256 outgoingAssetAmount2 = preOrderOutgoingAssetBalance2 / 7;

        {
            UniswapV2Payload[] memory payload1 = new UniswapV2Payload[](1);
            payload1[0] = uniswapPayload1;

            UniswapV2Payload[] memory payload2 = new UniswapV2Payload[](1);
            payload2[0] = uniswapPayload2;

            bytes memory swapData1 = __encodeMultiSwapData({
                _path: __paraSwapV5ConstructUniV2ForkPaths({
                    _incomingAssetAddress: address(incomingAsset1),
                    _payloads: payload1,
                    _percents: toArray(BPS_ONE_HUNDRED_PERCENT)
                })
            });

            bytes memory swapData2 = __encodeMultiSwapData({
                _path: __paraSwapV5ConstructUniV2ForkPaths({
                    _incomingAssetAddress: address(incomingAsset2),
                    _payloads: payload2,
                    _percents: toArray(BPS_ONE_HUNDRED_PERCENT)
                })
            });

            bytes[] memory encodedTakeOrderArgs = new bytes[](2);

            encodedTakeOrderArgs[0] = __encodeTakeOrderArgs({
                _minIncomingAssetAmount: 1,
                _expectedIncomingAssetAmount: 1,
                _outgoingAsset: address(outgoingAsset1),
                _outgoingAssetAmount: outgoingAssetAmount1,
                _swapType: IParaSwapV5AdapterProd.SwapType.Multi,
                _swapData: swapData1
            });

            // Specify a too-large minIncomingAssetAmount to prompt a failure
            encodedTakeOrderArgs[1] = __encodeTakeOrderArgs({
                _minIncomingAssetAmount: type(uint256).max / 2,
                _expectedIncomingAssetAmount: 1,
                _outgoingAsset: address(outgoingAsset2),
                _outgoingAssetAmount: outgoingAssetAmount2,
                _swapType: IParaSwapV5AdapterProd.SwapType.Multi,
                _swapData: swapData2
            });

            vm.recordLogs();

            if (!_allowOrdersToFail) {
                vm.expectRevert();
            } else {
                expectEmit(address(adapter));
                emit MultipleOrdersItemFailed(1, formatError("Received amount of tokens are less then expected"));
            }

            __takeMultipleOrders({_ordersData: encodedTakeOrderArgs, _allowOrdersToFail: _allowOrdersToFail});
        }
    }

    function test_takeMultipleOrders_successOneOrderFails() public {
        __test_takeMultipleOrders_oneOrderFails({_allowOrdersToFail: true});
    }

    function test_takeMultipleOrders_failsOneOrderFails() public {
        __test_takeMultipleOrders_oneOrderFails({_allowOrdersToFail: false});
    }
}

contract ParaSwapV5AdapterEthereumTest is ParaSwapV5AdapterBaseTest {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: ETHEREUM_CHAIN_ID,
            _augustSwapperAddress: ETHEREUM_PARASWAP_V5_AUGUSTUS_SWAPPER,
            _tokenTransferProxyAddress: ETHEREUM_PARASWAP_V5_TOKEN_TRANSFER_PROXY,
            _uniswapPoolAddress1: ETHEREUM_UNISWAP_DAI_WETH_POOL_ADDRESS,
            _uniswapPoolAddress2: ETHEREUM_UNISWAP_USDC_USDT_POOL_ADDRESS,
            _sushiPoolAddress1: ETHEREUM_SUSHI_DAI_WETH_POOL_ADDRESS
        });
    }
}

contract ParaSwapV5AdapterEthereumTestV4 is ParaSwapV5AdapterBaseTest {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: ETHEREUM_CHAIN_ID,
            _augustSwapperAddress: ETHEREUM_PARASWAP_V5_AUGUSTUS_SWAPPER,
            _tokenTransferProxyAddress: ETHEREUM_PARASWAP_V5_TOKEN_TRANSFER_PROXY,
            _uniswapPoolAddress1: ETHEREUM_UNISWAP_DAI_WETH_POOL_ADDRESS,
            _uniswapPoolAddress2: ETHEREUM_UNISWAP_USDC_USDT_POOL_ADDRESS,
            _sushiPoolAddress1: ETHEREUM_SUSHI_DAI_WETH_POOL_ADDRESS
        });
    }
}

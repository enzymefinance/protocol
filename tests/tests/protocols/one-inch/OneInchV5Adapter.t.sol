// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IOneInchV5AggregationRouter} from "tests/interfaces/external/IOneInchV5AggregationRouter.sol";
import {IOneInchV5Adapter} from "tests/interfaces/internal/IOneInchV5Adapter.sol";

address constant ETHEREUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS = 0x1111111254EEB25477B68fb85Ed929f73A960582;
address constant ETHEREUM_ONE_INCH_EXECUTOR = 0xE37e799D5077682FA0a244D46E5649F71457BD09;

address constant POLYGON_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS = ETHEREUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS;
address constant POLYGON_ONE_INCH_EXECUTOR = ETHEREUM_ONE_INCH_EXECUTOR;

address constant ARBITRUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS = ETHEREUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS;
address constant ARBITRUM_ONE_INCH_EXECUTOR = ETHEREUM_ONE_INCH_EXECUTOR;

address constant BASE_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS = ETHEREUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS;
address constant BASE_ONE_INCH_EXECUTOR = ETHEREUM_ONE_INCH_EXECUTOR;

// "data" in the TakeOrders is taken from the One Inch api https://api.1inch.dev/swap/v5.2
abstract contract TestBase is IntegrationTest {
    event MultipleOrdersItemFailed(uint256 index, bytes reason);

    error ReturnAmountIsNotEnough(); // error returned from OneInch

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IOneInchV5Adapter internal adapter;

    EnzymeVersion internal version;

    struct TakeOrder {
        address executor;
        IOneInchV5AggregationRouter.SwapDescription swapDescription;
        bytes data;
    }

    struct TakeOrderUniqueTokenAmounts {
        address[] srcTokens;
        uint256[] srcAmounts;
        address[] dstTokens;
        uint256[] dstAmounts;
    }

    struct TokenBalances {
        uint256[] srcTokenBalances;
        uint256[] dstTokenBalances;
    }

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        uint256 _forkBlock,
        address _oneInchV5ExchangeAddress
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId, _forkBlock: _forkBlock});

        version = _version;

        adapter = __deployAdapter(_oneInchV5ExchangeAddress);

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(address _oneInchV5ExchangeAddress) private returns (IOneInchV5Adapter) {
        bytes memory args = abi.encode(getIntegrationManagerAddressForVersion(version), _oneInchV5ExchangeAddress);
        address addr = deployCode("OneInchV5Adapter.sol", args);
        return IOneInchV5Adapter(addr);
    }

    // ACTION HELPERS

    function __takeOrder(
        address _executor,
        IOneInchV5AggregationRouter.SwapDescription memory _swapDescription,
        bytes memory _data
    ) private {
        bytes memory actionArgs = abi.encode(_executor, _swapDescription, _data);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(adapter),
            _selector: IOneInchV5Adapter.takeOrder.selector
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
            _selector: IOneInchV5Adapter.takeMultipleOrders.selector
        });
    }

    // MISC HELPERS

    function __encodeTakeOrderCallArgs(
        address _executor,
        IOneInchV5AggregationRouter.SwapDescription memory _swapDescription,
        bytes memory _data
    ) internal pure returns (bytes memory) {
        return abi.encode(_executor, _swapDescription, _data);
    }

    function __getTakeOrdersUniqueTokenAmounts(TakeOrder[] memory _takeOrders)
        internal
        pure
        returns (TakeOrderUniqueTokenAmounts memory)
    {
        address[] memory srcTokens = new address[](_takeOrders.length);
        uint256[] memory srcAmounts = new uint256[](_takeOrders.length);

        address[] memory dstTokens = new address[](_takeOrders.length);
        uint256[] memory dstAmounts = new uint256[](_takeOrders.length);

        for (uint256 i; i < _takeOrders.length; i++) {
            srcTokens[i] = _takeOrders[i].swapDescription.srcToken;
            srcAmounts[i] = _takeOrders[i].swapDescription.amount;

            dstTokens[i] = _takeOrders[i].swapDescription.dstToken;
            dstAmounts[i] = _takeOrders[i].swapDescription.minReturnAmount;
        }

        (address[] memory uniqueSrcTokens, uint256[] memory uniqueSrcAmounts) =
            aggregateAssetAmounts({_rawAssets: srcTokens, _rawAmounts: srcAmounts, _ceilingAtMax: false});

        (address[] memory uniqueDstTokens, uint256[] memory uniqueDstAmounts) =
            aggregateAssetAmounts({_rawAssets: dstTokens, _rawAmounts: dstAmounts, _ceilingAtMax: false});

        return TakeOrderUniqueTokenAmounts({
            srcTokens: uniqueSrcTokens,
            srcAmounts: uniqueSrcAmounts,
            dstTokens: uniqueDstTokens,
            dstAmounts: uniqueDstAmounts
        });
    }

    function __getTokenBalances(address[] memory _srcTokens, address[] memory _dstTokens)
        internal
        view
        returns (TokenBalances memory)
    {
        uint256[] memory srcTokenBalances = new uint256[](_srcTokens.length);
        for (uint256 i; i < _srcTokens.length; i++) {
            srcTokenBalances[i] = IERC20(_srcTokens[i]).balanceOf(vaultProxyAddress);
        }

        uint256[] memory dstTokenBalances = new uint256[](_dstTokens.length);
        for (uint256 i; i < _dstTokens.length; i++) {
            dstTokenBalances[i] = IERC20(_dstTokens[i]).balanceOf(vaultProxyAddress);
        }

        return TokenBalances({srcTokenBalances: srcTokenBalances, dstTokenBalances: dstTokenBalances});
    }

    // TESTS HELPERS

    function __test_takeMultipleOrders_successNotAllowedFailure(TakeOrder[] memory _takeOrders) internal {
        TakeOrderUniqueTokenAmounts memory takeOrdersUniqueTokenAmounts = __getTakeOrdersUniqueTokenAmounts(_takeOrders);

        // increase token balances so vault has enough funds to take orders
        for (uint256 i; i < takeOrdersUniqueTokenAmounts.srcTokens.length; i++) {
            increaseTokenBalance({
                _token: IERC20(takeOrdersUniqueTokenAmounts.srcTokens[i]),
                _to: vaultProxyAddress,
                _amount: takeOrdersUniqueTokenAmounts.srcAmounts[i]
            });
        }

        TokenBalances memory initialTokenBalances = __getTokenBalances({
            _srcTokens: takeOrdersUniqueTokenAmounts.srcTokens,
            _dstTokens: takeOrdersUniqueTokenAmounts.dstTokens
        });

        bytes[] memory ordersData = new bytes[](_takeOrders.length);
        for (uint256 i; i < _takeOrders.length; i++) {
            ordersData[i] = __encodeTakeOrderCallArgs({
                _executor: _takeOrders[i].executor,
                _swapDescription: _takeOrders[i].swapDescription,
                _data: _takeOrders[i].data
            });
        }

        vm.recordLogs();

        __takeMultipleOrders({_ordersData: ordersData, _allowOrdersToFail: false});

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: takeOrdersUniqueTokenAmounts.srcTokens,
            _maxSpendAssetAmounts: takeOrdersUniqueTokenAmounts.srcAmounts,
            _incomingAssets: takeOrdersUniqueTokenAmounts.dstTokens,
            _minIncomingAssetAmounts: new uint256[](takeOrdersUniqueTokenAmounts.dstTokens.length) // minReturnAmounts are zeroes in order to support optional order failure bypass
        });

        // assert vault balances after take orders
        for (uint256 i; i < takeOrdersUniqueTokenAmounts.srcTokens.length; i++) {
            assertEq(
                IERC20(takeOrdersUniqueTokenAmounts.srcTokens[i]).balanceOf(vaultProxyAddress),
                initialTokenBalances.srcTokenBalances[i] - takeOrdersUniqueTokenAmounts.srcAmounts[i],
                "srcToken balance mismatch"
            );
        }
        for (uint256 i; i < takeOrdersUniqueTokenAmounts.dstTokens.length; i++) {
            assertGe(
                IERC20(takeOrdersUniqueTokenAmounts.dstTokens[i]).balanceOf(vaultProxyAddress),
                initialTokenBalances.dstTokenBalances[i] + takeOrdersUniqueTokenAmounts.dstAmounts[i],
                "dstToken balance mismatch"
            );
        }
    }

    function __test_takeMultipleOrders_successAllowedFailure(
        TakeOrder[] memory _takeOrdersSucceed,
        TakeOrder[] memory _takeOrdersFailed,
        bytes[] memory _takeOrdersFailedReasons
    ) internal {
        TakeOrderUniqueTokenAmounts memory takeOrdersUniqueTokenAmountsFailed =
            __getTakeOrdersUniqueTokenAmounts(_takeOrdersFailed);

        TakeOrderUniqueTokenAmounts memory takeOrdersUniqueTokenAmountsSucceed =
            __getTakeOrdersUniqueTokenAmounts(_takeOrdersSucceed);

        // increase token balances so vault has enough funds to take orders
        for (uint256 i; i < takeOrdersUniqueTokenAmountsSucceed.srcTokens.length; i++) {
            increaseTokenBalance({
                _token: IERC20(takeOrdersUniqueTokenAmountsSucceed.srcTokens[i]),
                _to: vaultProxyAddress,
                _amount: takeOrdersUniqueTokenAmountsSucceed.srcAmounts[i]
            });
        }
        for (uint256 i; i < takeOrdersUniqueTokenAmountsFailed.srcTokens.length; i++) {
            increaseTokenBalance({
                _token: IERC20(takeOrdersUniqueTokenAmountsFailed.srcTokens[i]),
                _to: vaultProxyAddress,
                _amount: takeOrdersUniqueTokenAmountsFailed.srcAmounts[i]
            });
        }

        TokenBalances memory initialTokenBalancesSucceed = __getTokenBalances({
            _srcTokens: takeOrdersUniqueTokenAmountsSucceed.srcTokens,
            _dstTokens: takeOrdersUniqueTokenAmountsSucceed.dstTokens
        });
        TokenBalances memory initialTokenBalancesFailed = __getTokenBalances({
            _srcTokens: takeOrdersUniqueTokenAmountsFailed.srcTokens,
            _dstTokens: takeOrdersUniqueTokenAmountsFailed.dstTokens
        });

        bytes[] memory ordersData = new bytes[](_takeOrdersSucceed.length + _takeOrdersFailed.length);
        for (uint256 i = 0; i < _takeOrdersFailed.length; i++) {
            ordersData[i] = __encodeTakeOrderCallArgs({
                _executor: _takeOrdersFailed[i].executor,
                _swapDescription: _takeOrdersFailed[i].swapDescription,
                _data: _takeOrdersFailed[i].data
            });
        }
        for (uint256 i = 0; i < _takeOrdersSucceed.length; i++) {
            ordersData[i + _takeOrdersFailed.length] = __encodeTakeOrderCallArgs({
                _executor: _takeOrdersSucceed[i].executor,
                _swapDescription: _takeOrdersSucceed[i].swapDescription,
                _data: _takeOrdersSucceed[i].data
            });
        }

        // assert failed take orders events
        for (uint256 i = 0; i < _takeOrdersFailed.length; i++) {
            expectEmit(address(adapter));
            emit MultipleOrdersItemFailed(i, _takeOrdersFailedReasons[i]);
        }

        vm.recordLogs();

        __takeMultipleOrders({_ordersData: ordersData, _allowOrdersToFail: true});

        // merge take orders to gather assert values for events
        TakeOrder[] memory takeOrders = new TakeOrder[](_takeOrdersSucceed.length + _takeOrdersFailed.length);
        for (uint256 i = 0; i < _takeOrdersFailed.length; i++) {
            takeOrders[i] = _takeOrdersFailed[i];
        }
        for (uint256 i = 0; i < _takeOrdersSucceed.length; i++) {
            takeOrders[i + _takeOrdersFailed.length] = _takeOrdersSucceed[i];
        }
        TakeOrderUniqueTokenAmounts memory takeOrdersUniqueTokenAmounts = __getTakeOrdersUniqueTokenAmounts(takeOrders);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: takeOrdersUniqueTokenAmounts.srcTokens,
            _maxSpendAssetAmounts: takeOrdersUniqueTokenAmounts.srcAmounts,
            _incomingAssets: takeOrdersUniqueTokenAmounts.dstTokens,
            _minIncomingAssetAmounts: new uint256[](takeOrdersUniqueTokenAmounts.dstTokens.length) // minReturnAmounts are zeroes in order to support optional order failure bypass
        });

        // assert failed take order balances
        for (uint256 i; i < takeOrdersUniqueTokenAmountsFailed.srcTokens.length; i++) {
            // calculate the amount of the same srcTokens that were successfully taken, and take them into account for the failed orders balance check
            uint256 srcTokensAmountSucceed = 0;
            for (uint256 j; j < takeOrdersUniqueTokenAmountsSucceed.srcTokens.length; j++) {
                if (takeOrdersUniqueTokenAmountsSucceed.srcTokens[j] == takeOrdersUniqueTokenAmountsFailed.srcTokens[i])
                {
                    srcTokensAmountSucceed += takeOrdersUniqueTokenAmountsSucceed.srcAmounts[j];
                }
            }
            assertEq(
                IERC20(takeOrdersUniqueTokenAmountsFailed.srcTokens[i]).balanceOf(vaultProxyAddress),
                initialTokenBalancesFailed.srcTokenBalances[i] - srcTokensAmountSucceed,
                "srcToken balance mismatch"
            );
        }

        for (uint256 i; i < takeOrdersUniqueTokenAmountsFailed.dstTokens.length; i++) {
            // calculate the amount of the same dstTokens that were successfully transferred to the vault, and take them into account for the failed orders balance check
            uint256 dstTokensAmountSucceed = 0;
            for (uint256 j; j < takeOrdersUniqueTokenAmountsSucceed.dstTokens.length; j++) {
                if (takeOrdersUniqueTokenAmountsSucceed.dstTokens[j] == takeOrdersUniqueTokenAmountsFailed.dstTokens[i])
                {
                    dstTokensAmountSucceed += takeOrdersUniqueTokenAmountsSucceed.dstAmounts[j];
                }
            }
            assertGe(
                IERC20(takeOrdersUniqueTokenAmountsFailed.dstTokens[i]).balanceOf(vaultProxyAddress),
                initialTokenBalancesFailed.dstTokenBalances[i] + dstTokensAmountSucceed,
                "dstToken balance mismatch"
            );
        }

        // assert succeed take orders balances
        for (uint256 i; i < takeOrdersUniqueTokenAmountsSucceed.srcTokens.length; i++) {
            assertEq(
                IERC20(takeOrdersUniqueTokenAmountsSucceed.srcTokens[i]).balanceOf(vaultProxyAddress),
                initialTokenBalancesSucceed.srcTokenBalances[i] - takeOrdersUniqueTokenAmountsSucceed.srcAmounts[i],
                "srcToken balance mismatch"
            );
        }

        for (uint256 i; i < takeOrdersUniqueTokenAmountsSucceed.dstTokens.length; i++) {
            assertGe(
                IERC20(takeOrdersUniqueTokenAmountsSucceed.dstTokens[i]).balanceOf(vaultProxyAddress),
                initialTokenBalancesSucceed.dstTokenBalances[i] + takeOrdersUniqueTokenAmountsSucceed.dstAmounts[i],
                "dstToken balance mismatch"
            );
        }
    }

    function __test_takeOrder_success(TakeOrder memory _takeOrder) internal {
        // increase token balances so vault has enough funds to take orders
        increaseTokenBalance({
            _token: IERC20(_takeOrder.swapDescription.srcToken),
            _to: vaultProxyAddress,
            _amount: _takeOrder.swapDescription.amount
        });

        uint256 initialSrcTokenBalance = IERC20(_takeOrder.swapDescription.srcToken).balanceOf(vaultProxyAddress);
        uint256 initialDstTokenBalance = IERC20(_takeOrder.swapDescription.dstToken).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __takeOrder({
            _executor: _takeOrder.executor,
            _swapDescription: _takeOrder.swapDescription,
            _data: _takeOrder.data
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(_takeOrder.swapDescription.srcToken),
            _maxSpendAssetAmounts: toArray(_takeOrder.swapDescription.amount),
            _incomingAssets: toArray(_takeOrder.swapDescription.dstToken),
            _minIncomingAssetAmounts: toArray(_takeOrder.swapDescription.minReturnAmount)
        });

        // assert vault balances after take order
        assertEq(
            IERC20(_takeOrder.swapDescription.srcToken).balanceOf(vaultProxyAddress),
            initialSrcTokenBalance - _takeOrder.swapDescription.amount,
            "srcToken balance mismatch"
        );
        assertGe(
            IERC20(_takeOrder.swapDescription.dstToken).balanceOf(vaultProxyAddress),
            initialDstTokenBalance + _takeOrder.swapDescription.minReturnAmount,
            "dstToken balance mismatch"
        );
    }

    // TESTS

    function test_takeOrder_failsInvalidDstReceiver() public {
        vm.expectRevert("parseAssetsForAction: invalid dstReceiver");

        __takeOrder({
            _executor: makeAddr("fake executor"),
            _swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: makeAddr("fake srcToken"),
                dstToken: makeAddr("fake dstToken"),
                srcReceiver: payable(makeAddr("fake srcReceiver")),
                dstReceiver: payable(makeAddr("invalid dstReceiver")),
                amount: 1,
                minReturnAmount: 1,
                flags: 0
            }),
            _data: ""
        });
    }

    function test_takeMultipleOrders_failsInvalidDstReceiver() public {
        vm.expectRevert("parseAssetsForAction: invalid dstReceiver");

        bytes[] memory ordersData = new bytes[](1);
        ordersData[0] = __encodeTakeOrderCallArgs({
            _executor: makeAddr("fake executor"),
            _swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: makeAddr("fake srcToken"),
                dstToken: makeAddr("fake dstToken"),
                srcReceiver: payable(makeAddr("fake srcReceiver")),
                dstReceiver: payable(makeAddr("invalid dstReceiver")),
                amount: 1,
                minReturnAmount: 1,
                flags: 0
            }),
            _data: ""
        });

        __takeMultipleOrders({_ordersData: ordersData, _allowOrdersToFail: false});
    }
}

abstract contract TestBaseEthereum is TestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ETHEREUM_CHAIN_ID,
            _version: _version,
            _oneInchV5ExchangeAddress: ETHEREUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE_ONE_INCH_V5
        });
    }

    function test_takeMultipleOrders_successNotAllowedFailure() public {
        TakeOrder[] memory takeOrders = new TakeOrder[](3);

        takeOrders[0] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_WETH,
                dstToken: ETHEREUM_USDC,
                srcReceiver: payable(0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc), // Uniswap V2 USDC-WETH pool
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ETHEREUM_WETH)),
                minReturnAmount: 3625637980, // 3625.637980 USDC
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200206ae4071138002dc6c0b4e16d0168e52d35cacd2c6185b44281ec28c9dc1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
        });
        takeOrders[1] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_DAI,
                dstToken: ETHEREUM_USDC,
                srcReceiver: payable(0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5), // Uniswap V2 DAI-USDC pool
                dstReceiver: payable(vaultProxyAddress),
                amount: 150 * assetUnit(IERC20(ETHEREUM_DAI)),
                minReturnAmount: 149572239, // 149.572239 USDC
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf786b175474e89094c44da98b954eedeac495271d0f00206ae40711b8002dc6c0ae461ca67b15dc8dc81ce7615e0320da1a9ab8d51111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000000000016b175474e89094c44da98b954eedeac495271d0f"
        });
        takeOrders[2] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_WETH,
                dstToken: ETHEREUM_STETH,
                srcReceiver: payable(0x4028DAAC072e492d34a3Afdbef0ba7e35D8b55C4), // Uniswap V2 stETH-WETH pool
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ETHEREUM_WETH)) / 2,
                minReturnAmount: 499187218641666625, // 0.500187218641666625n stETH
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200206ae4071138002dc6c04028daac072e492d34a3afdbef0ba7e35d8b55c41111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
        });

        __test_takeMultipleOrders_successNotAllowedFailure(takeOrders);
    }

    function test_takeMultipleOrders_successAllowedFailure() public {
        TakeOrder[] memory takeOrdersSucceed = new TakeOrder[](2);

        takeOrdersSucceed[0] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_WETH,
                dstToken: ETHEREUM_USDC,
                srcReceiver: payable(0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc), // Uniswap V2 USDC-WETH pool
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ETHEREUM_WETH)),
                minReturnAmount: 3625637980, // 3625.637980 USDC
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200206ae4071138002dc6c0b4e16d0168e52d35cacd2c6185b44281ec28c9dc1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
        });
        takeOrdersSucceed[1] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_DAI,
                dstToken: ETHEREUM_USDC,
                srcReceiver: payable(0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5), // Uniswap V2 DAI-USDC pool
                dstReceiver: payable(vaultProxyAddress),
                amount: 150 * assetUnit(IERC20(ETHEREUM_DAI)),
                minReturnAmount: 149572239, // 149.572239 USDC
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf786b175474e89094c44da98b954eedeac495271d0f00206ae40711b8002dc6c0ae461ca67b15dc8dc81ce7615e0320da1a9ab8d51111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000000000016b175474e89094c44da98b954eedeac495271d0f"
        });

        TakeOrder[] memory takeOrdersFailed = new TakeOrder[](2);
        takeOrdersFailed[0] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_WETH,
                dstToken: ETHEREUM_STETH,
                srcReceiver: payable(0x4028DAAC072e492d34a3Afdbef0ba7e35D8b55C4), // Uniswap V2 stETH-WETH pool
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ETHEREUM_WETH)),
                minReturnAmount: 2 * assetUnit(IERC20(ETHEREUM_STETH)),
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200206ae4071138002dc6c04028daac072e492d34a3afdbef0ba7e35d8b55c41111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
        });
        takeOrdersFailed[1] = TakeOrder({
            executor: ETHEREUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ETHEREUM_DAI,
                dstToken: ETHEREUM_USDC,
                srcReceiver: payable(makeAddr("invalid src receiver")),
                dstReceiver: payable(vaultProxyAddress),
                amount: 150 * assetUnit(IERC20(ETHEREUM_DAI)),
                minReturnAmount: 200 * assetUnit(IERC20(ETHEREUM_USDC)),
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf786b175474e89094c44da98b954eedeac495271d0f00206ae40711b8002dc6c0ae461ca67b15dc8dc81ce7615e0320da1a9ab8d51111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000000000016b175474e89094c44da98b954eedeac495271d0f"
        });

        bytes[] memory takeOrdersFailedReasons = new bytes[](2);
        takeOrdersFailedReasons[0] = abi.encodePacked(ReturnAmountIsNotEnough.selector);
        takeOrdersFailedReasons[1] =
            hex"064a4ec600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001"; // 0x064a4ec6 is unknown selector, and couldn't be decoded with cast 4byte-decode

        __test_takeMultipleOrders_successAllowedFailure({
            _takeOrdersSucceed: takeOrdersSucceed,
            _takeOrdersFailed: takeOrdersFailed,
            _takeOrdersFailedReasons: takeOrdersFailedReasons
        });
    }

    function test_takeOrder_success() public {
        __test_takeOrder_success(
            TakeOrder({
                executor: ETHEREUM_ONE_INCH_EXECUTOR,
                swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                    srcToken: ETHEREUM_WETH,
                    dstToken: ETHEREUM_USDC,
                    srcReceiver: payable(0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc), // Uniswap V2 USDC-WETH pool
                    dstReceiver: payable(vaultProxyAddress),
                    amount: 1 * assetUnit(IERC20(ETHEREUM_WETH)),
                    minReturnAmount: 3625637980, // 3625.637980 USDC
                    flags: 4
                }),
                data: hex"00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200206ae4071138002dc6c0b4e16d0168e52d35cacd2c6185b44281ec28c9dc1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
            })
        );
    }
}

abstract contract TestBasePolygon is TestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: POLYGON_CHAIN_ID,
            _version: _version,
            _oneInchV5ExchangeAddress: POLYGON_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS,
            _forkBlock: POLYGON_BLOCK_TIME_SENSITIVE_ONE_INCH_V5
        });
    }

    function test_takeMultipleOrders_successNotAllowedFailure() public {
        TakeOrder[] memory takeOrders = new TakeOrder[](3);

        takeOrders[0] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_WBTC,
                dstToken: POLYGON_WMATIC,
                srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(POLYGON_WBTC)),
                minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WMATIC
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrders[1] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_WETH,
                dstToken: POLYGON_LINK,
                srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 3 * assetUnit(IERC20(POLYGON_WETH)),
                minReturnAmount: 543841392125881657536, // 543.841392125881657536 LINK
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000059700056900051f00001a0020d6bdbf787ceb23fd6bc0add59e62ac25578270cff1b9f61900a0c9e75c48000000000000030303010000000000000000000000000000000000000004d70003980002cc00018e00a007e5c0d200000000000000000000000000000000000000000000016a00011b0000cc00a0c9e75c4800000000000000001f1300000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500ce67850420c82db45eb7feeccd2d181300d2bdb37ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50045dda9cb7c25131df268515131f647d726f506087ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501d36ec33c8bed5a9f7b6630855f1533455b98a4182791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c335900a007e5c0d200000000000000000000000000000000000000000000000000011a00004e48204b543e89351faa242cb0172b2da0cdb52db699b47ceb23fd6bc0add59e62ac25578270cff1b9f619bd6015b4000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c4800000000000000002d0500000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501efdc563f99310a5dd189eaaa91a1bf28034da94c2791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50194ab9e4553ffb839431e37cc79ba8905f45bfbea2791bca1f2de4661ed88a30c99a7a9449aa8417400a0c9e75c480000000000000000280a00000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003dc10d7bfb94eeb009203e84a653e5764f71771d7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003e31ab7f37c048fc6574189135d108df80f0ea267ceb23fd6bc0add59e62ac25578270cff1b9f61900a007e5c0d200000000000000000000000000000000000000000000000000011b0000cc00a0c9e75c4800000000000000002f0300000000000000000000000000000000000000000000000000009e00004f00a0fbb7cd06000297e37f1873d2dab4487aa67cd56b58e2f278750001000000000000000000027ceb23fd6bc0add59e62ac25578270cff1b9f6190d500b1d8e8ef31e21c99d1db9a6444d3adf127002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5010a28c2f5e0e8463e047c203f00f649812ae67e4f0d500b1d8e8ef31e21c99d1db9a6444d3adf127000a0f2fa6b6653e0bca35ec356bd5dddfebbd1fc0fd03fabad3900000000000000000000000000000000000000000000001d89f30d6fd366a0bb000000000000000003857f4476b52f0180a06c4eca2753e0bca35ec356bd5dddfebbd1fc0fd03fabad391111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrders[2] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_MLN,
                dstToken: POLYGON_LINK,
                srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 3 * assetUnit(IERC20(POLYGON_MLN)),
                minReturnAmount: 383313066104674434, // 3.883313066104674434 LINK
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000000000000000000f000001a0020d6bdbf78a9f37d84c856fda3812ad0519dad44fa0a3fe20700a007e5c0d20000000000000000000000000000000000000000000000000000b200004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500acef97e28d22b2ad214d53739c552860cbb5b0c6a9f37d84c856fda3812ad0519dad44fa0a3fe20702a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c33591111111254eeb25477b68fb85ed929f73a960582"
        });

        __test_takeMultipleOrders_successNotAllowedFailure(takeOrders);
    }

    function test_takeMultipleOrders_successAllowedFailure() public {
        TakeOrder[] memory takeOrdersSucceed = new TakeOrder[](2);

        takeOrdersSucceed[0] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_WBTC,
                dstToken: POLYGON_WMATIC,
                srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(POLYGON_WBTC)),
                minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WMATIC
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrdersSucceed[1] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_WETH,
                dstToken: POLYGON_LINK,
                srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 3 * assetUnit(IERC20(POLYGON_WETH)),
                minReturnAmount: 543841392125881657536, // 543.841392125881657536 LINK
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000059700056900051f00001a0020d6bdbf787ceb23fd6bc0add59e62ac25578270cff1b9f61900a0c9e75c48000000000000030303010000000000000000000000000000000000000004d70003980002cc00018e00a007e5c0d200000000000000000000000000000000000000000000016a00011b0000cc00a0c9e75c4800000000000000001f1300000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500ce67850420c82db45eb7feeccd2d181300d2bdb37ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50045dda9cb7c25131df268515131f647d726f506087ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501d36ec33c8bed5a9f7b6630855f1533455b98a4182791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c335900a007e5c0d200000000000000000000000000000000000000000000000000011a00004e48204b543e89351faa242cb0172b2da0cdb52db699b47ceb23fd6bc0add59e62ac25578270cff1b9f619bd6015b4000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c4800000000000000002d0500000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501efdc563f99310a5dd189eaaa91a1bf28034da94c2791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50194ab9e4553ffb839431e37cc79ba8905f45bfbea2791bca1f2de4661ed88a30c99a7a9449aa8417400a0c9e75c480000000000000000280a00000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003dc10d7bfb94eeb009203e84a653e5764f71771d7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003e31ab7f37c048fc6574189135d108df80f0ea267ceb23fd6bc0add59e62ac25578270cff1b9f61900a007e5c0d200000000000000000000000000000000000000000000000000011b0000cc00a0c9e75c4800000000000000002f0300000000000000000000000000000000000000000000000000009e00004f00a0fbb7cd06000297e37f1873d2dab4487aa67cd56b58e2f278750001000000000000000000027ceb23fd6bc0add59e62ac25578270cff1b9f6190d500b1d8e8ef31e21c99d1db9a6444d3adf127002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5010a28c2f5e0e8463e047c203f00f649812ae67e4f0d500b1d8e8ef31e21c99d1db9a6444d3adf127000a0f2fa6b6653e0bca35ec356bd5dddfebbd1fc0fd03fabad3900000000000000000000000000000000000000000000001d89f30d6fd366a0bb000000000000000003857f4476b52f0180a06c4eca2753e0bca35ec356bd5dddfebbd1fc0fd03fabad391111111254eeb25477b68fb85ed929f73a960582"
        });

        TakeOrder[] memory takeOrdersFailed = new TakeOrder[](2);
        takeOrdersFailed[0] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_WBTC,
                dstToken: POLYGON_WMATIC,
                srcReceiver: payable(makeAddr("invalid src receiver")),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(POLYGON_WBTC)) / 2,
                minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WMATIC
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrdersFailed[1] = TakeOrder({
            executor: POLYGON_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: POLYGON_MLN,
                dstToken: POLYGON_LINK,
                srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(POLYGON_MLN)),
                minReturnAmount: 3879056849915510592, // 3.879056849915510592 LINK
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000000000000000000f000001a0020d6bdbf78a9f37d84c856fda3812ad0519dad44fa0a3fe20700a007e5c0d20000000000000000000000000000000000000000000000000000b200004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500acef97e28d22b2ad214d53739c552860cbb5b0c6a9f37d84c856fda3812ad0519dad44fa0a3fe20702a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c33591111111254eeb25477b68fb85ed929f73a960582"
        });

        bytes[] memory takeOrdersFailedReasons = new bytes[](2);
        takeOrdersFailedReasons[0] = formatError("AS");
        takeOrdersFailedReasons[1] = abi.encodePacked(ReturnAmountIsNotEnough.selector);

        __test_takeMultipleOrders_successAllowedFailure({
            _takeOrdersSucceed: takeOrdersSucceed,
            _takeOrdersFailed: takeOrdersFailed,
            _takeOrdersFailedReasons: takeOrdersFailedReasons
        });
    }

    function test_takeOrder_success() public {
        __test_takeOrder_success(
            TakeOrder({
                executor: POLYGON_ONE_INCH_EXECUTOR,
                swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                    srcToken: POLYGON_WBTC,
                    dstToken: POLYGON_WMATIC,
                    srcReceiver: payable(POLYGON_ONE_INCH_EXECUTOR),
                    dstReceiver: payable(vaultProxyAddress),
                    amount: 1 * assetUnit(IERC20(POLYGON_WBTC)),
                    minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WMATIC
                    flags: 4
                }),
                data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
            })
        );
    }
}

// TODO: Replace the payloads with actual arbitrum payloads
abstract contract TestBaseArbitrum is TestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ARBITRUM_CHAIN_ID,
            _version: _version,
            _oneInchV5ExchangeAddress: ARBITRUM_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS,
            _forkBlock: 55_136_740 // TODO: REPLACE THIS, and assign this value into the ARBITRUM_BLOCK_TIME_SENSITIVE_ONE_INCH_V5 in Constants.sol
        });
    }

    function test_takeMultipleOrders_successNotAllowedFailure() public {
        TakeOrder[] memory takeOrders = new TakeOrder[](3);

        takeOrders[0] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_WBTC,
                dstToken: ARBITRUM_WETH,
                srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ARBITRUM_WBTC)),
                minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WETH
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrders[1] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_WETH,
                dstToken: ARBITRUM_LINK,
                srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 3 * assetUnit(IERC20(ARBITRUM_WETH)),
                minReturnAmount: 543841392125881657536, // 543.841392125881657536 LINK
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000059700056900051f00001a0020d6bdbf787ceb23fd6bc0add59e62ac25578270cff1b9f61900a0c9e75c48000000000000030303010000000000000000000000000000000000000004d70003980002cc00018e00a007e5c0d200000000000000000000000000000000000000000000016a00011b0000cc00a0c9e75c4800000000000000001f1300000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500ce67850420c82db45eb7feeccd2d181300d2bdb37ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50045dda9cb7c25131df268515131f647d726f506087ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501d36ec33c8bed5a9f7b6630855f1533455b98a4182791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c335900a007e5c0d200000000000000000000000000000000000000000000000000011a00004e48204b543e89351faa242cb0172b2da0cdb52db699b47ceb23fd6bc0add59e62ac25578270cff1b9f619bd6015b4000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c4800000000000000002d0500000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501efdc563f99310a5dd189eaaa91a1bf28034da94c2791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50194ab9e4553ffb839431e37cc79ba8905f45bfbea2791bca1f2de4661ed88a30c99a7a9449aa8417400a0c9e75c480000000000000000280a00000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003dc10d7bfb94eeb009203e84a653e5764f71771d7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003e31ab7f37c048fc6574189135d108df80f0ea267ceb23fd6bc0add59e62ac25578270cff1b9f61900a007e5c0d200000000000000000000000000000000000000000000000000011b0000cc00a0c9e75c4800000000000000002f0300000000000000000000000000000000000000000000000000009e00004f00a0fbb7cd06000297e37f1873d2dab4487aa67cd56b58e2f278750001000000000000000000027ceb23fd6bc0add59e62ac25578270cff1b9f6190d500b1d8e8ef31e21c99d1db9a6444d3adf127002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5010a28c2f5e0e8463e047c203f00f649812ae67e4f0d500b1d8e8ef31e21c99d1db9a6444d3adf127000a0f2fa6b6653e0bca35ec356bd5dddfebbd1fc0fd03fabad3900000000000000000000000000000000000000000000001d89f30d6fd366a0bb000000000000000003857f4476b52f0180a06c4eca2753e0bca35ec356bd5dddfebbd1fc0fd03fabad391111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrders[2] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_MLN,
                dstToken: ARBITRUM_LINK,
                srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 3 * assetUnit(IERC20(ARBITRUM_MLN)),
                minReturnAmount: 383313066104674434, // 3.883313066104674434 LINK
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000000000000000000f000001a0020d6bdbf78a9f37d84c856fda3812ad0519dad44fa0a3fe20700a007e5c0d20000000000000000000000000000000000000000000000000000b200004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500acef97e28d22b2ad214d53739c552860cbb5b0c6a9f37d84c856fda3812ad0519dad44fa0a3fe20702a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c33591111111254eeb25477b68fb85ed929f73a960582"
        });

        __test_takeMultipleOrders_successNotAllowedFailure(takeOrders);
    }

    function test_takeMultipleOrders_successAllowedFailure() public {
        TakeOrder[] memory takeOrdersSucceed = new TakeOrder[](2);

        takeOrdersSucceed[0] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_WBTC,
                dstToken: ARBITRUM_WETH,
                srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ARBITRUM_WBTC)),
                minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WMATIC
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrdersSucceed[1] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_WETH,
                dstToken: ARBITRUM_LINK,
                srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 3 * assetUnit(IERC20(ARBITRUM_WETH)),
                minReturnAmount: 543841392125881657536, // 543.841392125881657536 LINK
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000059700056900051f00001a0020d6bdbf787ceb23fd6bc0add59e62ac25578270cff1b9f61900a0c9e75c48000000000000030303010000000000000000000000000000000000000004d70003980002cc00018e00a007e5c0d200000000000000000000000000000000000000000000016a00011b0000cc00a0c9e75c4800000000000000001f1300000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500ce67850420c82db45eb7feeccd2d181300d2bdb37ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50045dda9cb7c25131df268515131f647d726f506087ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501d36ec33c8bed5a9f7b6630855f1533455b98a4182791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c335900a007e5c0d200000000000000000000000000000000000000000000000000011a00004e48204b543e89351faa242cb0172b2da0cdb52db699b47ceb23fd6bc0add59e62ac25578270cff1b9f619bd6015b4000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c4800000000000000002d0500000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501efdc563f99310a5dd189eaaa91a1bf28034da94c2791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50194ab9e4553ffb839431e37cc79ba8905f45bfbea2791bca1f2de4661ed88a30c99a7a9449aa8417400a0c9e75c480000000000000000280a00000000000000000000000000000000000000000000000000009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003dc10d7bfb94eeb009203e84a653e5764f71771d7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5003e31ab7f37c048fc6574189135d108df80f0ea267ceb23fd6bc0add59e62ac25578270cff1b9f61900a007e5c0d200000000000000000000000000000000000000000000000000011b0000cc00a0c9e75c4800000000000000002f0300000000000000000000000000000000000000000000000000009e00004f00a0fbb7cd06000297e37f1873d2dab4487aa67cd56b58e2f278750001000000000000000000027ceb23fd6bc0add59e62ac25578270cff1b9f6190d500b1d8e8ef31e21c99d1db9a6444d3adf127002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5010a28c2f5e0e8463e047c203f00f649812ae67e4f0d500b1d8e8ef31e21c99d1db9a6444d3adf127000a0f2fa6b6653e0bca35ec356bd5dddfebbd1fc0fd03fabad3900000000000000000000000000000000000000000000001d89f30d6fd366a0bb000000000000000003857f4476b52f0180a06c4eca2753e0bca35ec356bd5dddfebbd1fc0fd03fabad391111111254eeb25477b68fb85ed929f73a960582"
        });

        TakeOrder[] memory takeOrdersFailed = new TakeOrder[](2);
        takeOrdersFailed[0] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_WBTC,
                dstToken: ARBITRUM_WETH,
                srcReceiver: payable(makeAddr("invalid src receiver")),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ARBITRUM_WBTC)) / 2,
                minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WETH
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrdersFailed[1] = TakeOrder({
            executor: ARBITRUM_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: ARBITRUM_MLN,
                dstToken: ARBITRUM_LINK,
                srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(ARBITRUM_MLN)),
                minReturnAmount: 3879056849915510592, // 3.879056849915510592 LINK
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000000000000000000f000001a0020d6bdbf78a9f37d84c856fda3812ad0519dad44fa0a3fe20700a007e5c0d20000000000000000000000000000000000000000000000000000b200004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500acef97e28d22b2ad214d53739c552860cbb5b0c6a9f37d84c856fda3812ad0519dad44fa0a3fe20702a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58179e4240e33c121402dfc9009de266356c91f241d3c499c542cef5e3811e1192ce70d8cc03d5c33591111111254eeb25477b68fb85ed929f73a960582"
        });

        bytes[] memory takeOrdersFailedReasons = new bytes[](2);
        takeOrdersFailedReasons[0] = formatError("AS");
        takeOrdersFailedReasons[1] = abi.encodePacked(ReturnAmountIsNotEnough.selector);

        __test_takeMultipleOrders_successAllowedFailure({
            _takeOrdersSucceed: takeOrdersSucceed,
            _takeOrdersFailed: takeOrdersFailed,
            _takeOrdersFailedReasons: takeOrdersFailedReasons
        });
    }

    function test_takeOrder_success() public {
        __test_takeOrder_success(
            TakeOrder({
                executor: ARBITRUM_ONE_INCH_EXECUTOR,
                swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                    srcToken: ARBITRUM_WBTC,
                    dstToken: ARBITRUM_WETH,
                    srcReceiver: payable(ARBITRUM_ONE_INCH_EXECUTOR),
                    dstReceiver: payable(vaultProxyAddress),
                    amount: 1 * assetUnit(IERC20(ARBITRUM_WBTC)),
                    minReturnAmount: 67592942543872121128930, // 67592.942543872121128930 WMATIC
                    flags: 4
                }),
                data: hex"0000000000000000000000000000000000000008170007e900079f00001a0020d6bdbf781bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000000008010100000000000000000000000000000000000000000000075700043300031800a007e5c0d20000000000000000000000000000000000000000000000000002f40001da00a0c9e75c48000000000000001812080000000000000000000000000000000000000000000001ac00015d00010e00a007e5c0d20000000000000000000000000000000000000000000000000000ea0000d051001d8b86e3d88cdb2d34688e87e72f388cb541b7c81bfd67037b42cf73acf2047067bd4f2c47d9bfd60044e2ad025a0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501a5cd8351cbf30b531c7b11b0d9d3ff38ea2e280f1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501eef1a9507b3d505f0062f2be9453981255b503c81bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c48000000000000001715060000000000000000000000000000000000000000000000ec00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50021988c9cfd08db3b5793c2c6782271dc947492512791bca1f2de4661ed88a30c99a7a9449aa8417402a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500a374094527e1673a86de625aa59517c5de346d322791bca1f2de4661ed88a30c99a7a9449aa8417448201093ced81987bf532c2b7907b2a8525cd0c172952791bca1f2de4661ed88a30c99a7a9449aa84174dd93f59a000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd0900a0c9e75c48000000000000001c14020000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5002981a1f699ea7149aa08121a07f000cf82846a9e1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5006b75f2189f0e11c52e814e09e280eb1a9a8a094a1bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500642f28a89fa9d0fa30e664f71804bfdd7341d21f1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a007e5c0d200000000000000000000000000000000000000000000000000030000011b00a0c9e75c4800000000000000250c010000000000000000000000000000000000000000000000ed00009e00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b694e3bdd4bcdf843510983d257679d1e627c4741bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50150eaedb835021e4a108b7290636d62e9765cc6d71bfd67037b42cf73acf2047067bd4f2c47d9bfd602a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501ac4494e30a85369e332bdb5230d6d694d4259dbc1bfd67037b42cf73acf2047067bd4f2c47d9bfd600a0c9e75c480000000000160c0c03010000000000000000000000000000000001b70001680001190000ca00007b0c207ceb23fd6bc0add59e62ac25578270cff1b9f619c4e595acdd7d12fec385e5da5d43160e8a0bac0e6ae4071118002dc6c0c4e595acdd7d12fec385e5da5d43160e8a0bac0e00000000000000000000000000000000000000000000000000000000000000017ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500167384319b41f7094e62f7506409eb38079abff87ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e5001a34eabbe928bf431b679959379b2225d60d9cda7ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e50086f1d8390222a3691c28938ec7404a1661e618e07ceb23fd6bc0add59e62ac25578270cff1b9f61902a00000000000000000000000000000000000000000000000000000000000000001ee63c1e500479e1b71a702a595e19b6d5932cd5c863ab57ee07ceb23fd6bc0add59e62ac25578270cff1b9f61900a0f2fa6b660d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000e509653ce057dc47927000000000000000042fd1d96d3822f4c80a06c4eca270d500b1d8e8ef31e21c99d1db9a6444d3adf12701111111254eeb25477b68fb85ed929f73a960582"
            })
        );
    }
}

abstract contract TestBaseBaseChain is TestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: BASE_CHAIN_ID,
            _version: _version,
            _oneInchV5ExchangeAddress: BASE_ONE_INCH_V5_AGGREGATION_ROUTER_ADDRESS,
            _forkBlock: BASE_CHAIN_BLOCK_TIME_SENSITIVE_ONE_INCH_V5
        });
    }

    function test_takeMultipleOrders_successNotAllowedFailure() public {
        TakeOrder[] memory takeOrders = new TakeOrder[](2);

        takeOrders[0] = TakeOrder({
            executor: BASE_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: BASE_WETH,
                dstToken: BASE_USDC,
                srcReceiver: payable(BASE_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(BASE_WETH)),
                minReturnAmount: 3601930662, // 3601.930662 USDC
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000022e00001a0020d6bdbf78420000000000000000000000000000000000000600a0c9e75c48000000000000000007030000000000000000000000000000000000000000000000000001e600018300a007e5c0d200000000000000000000000000000000000000000000000000015f00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501f6c0a374a483101e04ef5f7ac9bd15d9142bac9542000000000000000000000000000000000000064922616535324976f8dbcef19df0705b95ace86ebb48d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca00243eece7db0000000000000000000000001111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9b00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58172ab388e2e2f6facef59e3c3fa2c4e29011c2d3842000000000000000000000000000000000000061111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrders[1] = TakeOrder({
            executor: BASE_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: BASE_WETH,
                dstToken: BASE_DAI,
                srcReceiver: payable(BASE_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 2 * assetUnit(IERC20(BASE_WETH)),
                minReturnAmount: 7204961908149106211640, // 7204.961908149106211640 DAI
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000002350002070001bd00001a0020d6bdbf78420000000000000000000000000000000000000600a007e5c0d200000000000000000000000000000000000000000000000000017f00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b2cc224c1c9fee385f8ad6a55b4d94e92359dc594200000000000000000000000000000000000006512001538aa697ce8cc8252c70c41452dae86ce22a3e833589fcd6edb6e08f4c7c32d4f71b54bda0291300a4a5dcbcdf000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb0000000000000000000000001b55d94b553475e7561fab889bf88fe4f491d29c000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd09ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0f2fa6b6650c5725949a6f0c72e6c4a641f24049a917db0cb00000000000000000000000000000000000000000000018694eeb9eff8177b38000000000000000045683028d2c53e8680a06c4eca2750c5725949a6f0c72e6c4a641f24049a917db0cb1111111254eeb25477b68fb85ed929f73a960582"
        });

        __test_takeMultipleOrders_successNotAllowedFailure(takeOrders);
    }

    function test_takeMultipleOrders_successAllowedFailure() public {
        TakeOrder[] memory takeOrdersSucceed = new TakeOrder[](2);

        takeOrdersSucceed[0] = TakeOrder({
            executor: BASE_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: BASE_WETH,
                dstToken: BASE_USDC,
                srcReceiver: payable(BASE_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 1 * assetUnit(IERC20(BASE_WETH)),
                minReturnAmount: 3601930662, // 3601.930662 USDC
                flags: 4
            }),
            data: hex"00000000000000000000000000000000000000000000000000022e00001a0020d6bdbf78420000000000000000000000000000000000000600a0c9e75c48000000000000000007030000000000000000000000000000000000000000000000000001e600018300a007e5c0d200000000000000000000000000000000000000000000000000015f00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501f6c0a374a483101e04ef5f7ac9bd15d9142bac9542000000000000000000000000000000000000064922616535324976f8dbcef19df0705b95ace86ebb48d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca00243eece7db0000000000000000000000001111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9b00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58172ab388e2e2f6facef59e3c3fa2c4e29011c2d3842000000000000000000000000000000000000061111111254eeb25477b68fb85ed929f73a960582"
        });
        takeOrdersSucceed[1] = TakeOrder({
            executor: BASE_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: BASE_WETH,
                dstToken: BASE_DAI,
                srcReceiver: payable(BASE_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 2 * assetUnit(IERC20(BASE_WETH)),
                minReturnAmount: 7204961908149106211640, // 7204.961908149106211640 DAI
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000002350002070001bd00001a0020d6bdbf78420000000000000000000000000000000000000600a007e5c0d200000000000000000000000000000000000000000000000000017f00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b2cc224c1c9fee385f8ad6a55b4d94e92359dc594200000000000000000000000000000000000006512001538aa697ce8cc8252c70c41452dae86ce22a3e833589fcd6edb6e08f4c7c32d4f71b54bda0291300a4a5dcbcdf000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb0000000000000000000000001b55d94b553475e7561fab889bf88fe4f491d29c000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd09ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0f2fa6b6650c5725949a6f0c72e6c4a641f24049a917db0cb00000000000000000000000000000000000000000000018694eeb9eff8177b38000000000000000045683028d2c53e8680a06c4eca2750c5725949a6f0c72e6c4a641f24049a917db0cb1111111254eeb25477b68fb85ed929f73a960582"
        });

        TakeOrder[] memory takeOrdersFailed = new TakeOrder[](1);
        takeOrdersFailed[0] = TakeOrder({
            executor: BASE_ONE_INCH_EXECUTOR,
            swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                srcToken: BASE_WETH,
                dstToken: BASE_DAI,
                srcReceiver: payable(BASE_ONE_INCH_EXECUTOR),
                dstReceiver: payable(vaultProxyAddress),
                amount: 2 * assetUnit(IERC20(BASE_WETH)),
                minReturnAmount: 8204961908149106211640, // 8204.9619081491062116400 DAI
                flags: 4
            }),
            data: hex"0000000000000000000000000000000000000002350002070001bd00001a0020d6bdbf78420000000000000000000000000000000000000600a007e5c0d200000000000000000000000000000000000000000000000000017f00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501b2cc224c1c9fee385f8ad6a55b4d94e92359dc594200000000000000000000000000000000000006512001538aa697ce8cc8252c70c41452dae86ce22a3e833589fcd6edb6e08f4c7c32d4f71b54bda0291300a4a5dcbcdf000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000050c5725949a6f0c72e6c4a641f24049a917db0cb0000000000000000000000001b55d94b553475e7561fab889bf88fe4f491d29c000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd09ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0f2fa6b6650c5725949a6f0c72e6c4a641f24049a917db0cb00000000000000000000000000000000000000000000018694eeb9eff8177b38000000000000000045683028d2c53e8680a06c4eca2750c5725949a6f0c72e6c4a641f24049a917db0cb1111111254eeb25477b68fb85ed929f73a960582"
        });

        bytes[] memory takeOrdersFailedReasons = new bytes[](1);
        takeOrdersFailedReasons[0] = abi.encodePacked(ReturnAmountIsNotEnough.selector);

        __test_takeMultipleOrders_successAllowedFailure({
            _takeOrdersSucceed: takeOrdersSucceed,
            _takeOrdersFailed: takeOrdersFailed,
            _takeOrdersFailedReasons: takeOrdersFailedReasons
        });
    }

    function test_takeOrder_success() public {
        __test_takeOrder_success(
            TakeOrder({
                executor: BASE_ONE_INCH_EXECUTOR,
                swapDescription: IOneInchV5AggregationRouter.SwapDescription({
                    srcToken: BASE_WETH,
                    dstToken: BASE_USDC,
                    srcReceiver: payable(BASE_ONE_INCH_EXECUTOR),
                    dstReceiver: payable(vaultProxyAddress),
                    amount: 1 * assetUnit(IERC20(BASE_WETH)),
                    minReturnAmount: 3601930662, // 3601.930662 USDC
                    flags: 4
                }),
                data: hex"00000000000000000000000000000000000000000000000000022e00001a0020d6bdbf78420000000000000000000000000000000000000600a0c9e75c48000000000000000007030000000000000000000000000000000000000000000000000001e600018300a007e5c0d200000000000000000000000000000000000000000000000000015f00004f02a00000000000000000000000000000000000000000000000000000000000000001ee63c1e501f6c0a374a483101e04ef5f7ac9bd15d9142bac9542000000000000000000000000000000000000064922616535324976f8dbcef19df0705b95ace86ebb48d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca00243eece7db0000000000000000000000001111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9b00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000001ee63c1e58172ab388e2e2f6facef59e3c3fa2c4e29011c2d3842000000000000000000000000000000000000061111111254eeb25477b68fb85ed929f73a960582"
            })
        );
    }
}

contract OneInchV5AdapterEthereumTest is TestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract OneInchV5AdapterEthereumTestV4 is TestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract OneInchV5AdapterPolygonTest is TestBasePolygon {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract OneInchV5AdapterPolygonTestV4 is TestBasePolygon {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}
// TODO: Uncomment once we have retrieved payloads from arbitrum and adjusted the TestBaseArbitrum
// contract OneInchV5AdapterArbitrumTest is TestBaseArbitrum {
//     function setUp() public override {
//         __initialize(EnzymeVersion.Current);
//     }
// }

// contract OneInchV5AdapterArbitrumTestV4 is TestBaseArbitrum {
//     function setUp() public override {
//         __initialize(EnzymeVersion.V4);
//     }
// }

contract OneInchV5AdapterBaseTest is TestBaseBaseChain {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

// TODO: uncomment when the Base asset universe will be registered, and bump the test block number
// contract OneInchV5AdapterBaseTestV4 is TestBaseBaseChain {
//     function setUp() public override {
//         __initialize(EnzymeVersion.V4);
//     }
// }

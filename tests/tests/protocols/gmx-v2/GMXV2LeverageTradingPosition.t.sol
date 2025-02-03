// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IGMXV2LeverageTradingPosition as IGMXV2LeverageTradingPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/gmx-v2-leverage-trading/IGMXV2LeverageTradingPosition.sol";

import {IGMXV2Order as IGMXV2OrderProd} from "contracts/external-interfaces/IGMXV2Order.sol";

import {IUintListRegistry as IUintListRegistryProd} from "contracts/persistent/uint-list-registry/IUintListRegistry.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IGMXV2DataStore} from "tests/interfaces/external/IGMXV2DataStore.sol";
import {IGMXV2ChainlinkPriceFeedProvider} from "tests/interfaces/external/IGMXV2ChainlinkPriceFeedProvider.sol";
import {IGMXV2ExchangeRouter} from "tests/interfaces/external/IGMXV2ExchangeRouter.sol";
import {IGMXV2LiquidationHandler} from "tests/interfaces/external/IGMXV2LiquidationHandler.sol";
import {IGMXV2Market} from "tests/interfaces/external/IGMXV2Market.sol";
import {IGMXV2Order} from "tests/interfaces/external/IGMXV2Order.sol";
import {IGMXV2OrderHandler} from "tests/interfaces/external/IGMXV2OrderHandler.sol";
import {IGMXV2Prices} from "tests/interfaces/external/IGMXV2Prices.sol";
import {IGMXV2Position} from "tests/interfaces/external/IGMXV2Position.sol";
import {IGMXV2Reader} from "tests/interfaces/external/IGMXV2Reader.sol";
import {IGMXV2RoleStore} from "tests/interfaces/external/IGMXV2RoleStore.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IGMXV2LeverageTradingPositionLib} from "tests/interfaces/internal/IGMXV2LeverageTradingPositionLib.sol";
import {IGMXV2LeverageTradingPositionParser} from "tests/interfaces/internal/IGMXV2LeverageTradingPositionParser.sol";

import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";

// ARBITRUM CONSTANTS
IGMXV2ChainlinkPriceFeedProvider constant ARBITRUM_GMXV2_CHAINLINK_PRICE_FEED_PROVIDER =
    IGMXV2ChainlinkPriceFeedProvider(0x527FB0bCfF63C47761039bB386cFE181A92a4701);
address constant ARBITRUM_GMXV2_DATA_STORE_ADDRESS = 0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8;
IGMXV2ExchangeRouter constant ARBITRUM_GMXV2_EXCHANGE_ROUTER =
    IGMXV2ExchangeRouter(0x900173A66dbD345006C51fA35fA3aB760FcD843b);
IGMXV2LiquidationHandler constant ARBITRUM_GMXV2_LIQUIDATION_HANDLER =
    IGMXV2LiquidationHandler(0xdAb9bA9e3a301CCb353f18B4C8542BA2149E4010);
address constant ARBITRUM_GMXV2_REFERRAL_STORAGE_ADDRESS = 0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d;
IGMXV2Reader constant ARBITRUM_GMXV2_READER = IGMXV2Reader(0x0537C767cDAC0726c76Bb89e92904fe28fd02fE1);
IGMXV2RoleStore constant ARBITRUM_GMXV2_ROLE_STORE = IGMXV2RoleStore(0x3c3d99FD298f679DBC2CEcd132b4eC4d0F5e6e72);

address constant ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC = 0x70d95587d40A2caf56bd97485aB3Eec10Bee6336; // ETH/USD market, with WETH (Long) and USDC (Short) as collateral
address constant ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH = 0x450bb6774Dd8a756274E0ab4107953259d2ac541; // ETH/USD market, with WETH (Long) and WETH (Short) as collateral
address constant ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC = 0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77; // BTC/USD market, with WBTC (Long) and WBTC (Short) as collateral
address constant ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_USDC = 0x47c031236e19d024b42f8AE6780E44A573170703; // BTC/USD market, with WBTC (Long) and USDC (Short) as collateral

uint256 constant GMX_ONE_USD_UNIT = 10 ** 30;

abstract contract TestBase is IntegrationTest {
    using AddressArrayLib for address[];

    event CallbackContractSet(address market);

    event ClaimableCollateralAdded(bytes32 claimableCollateralKey, address token, address market, uint256 timeKey);

    event ClaimableCollateralRemoved(bytes32 claimableCollateralKey);

    event TrackedAssetAdded(address asset);

    event TrackedAssetsCleared();

    event TrackedMarketAdded(address market);

    event TrackedMarketRemoved(address market);

    IGMXV2LeverageTradingPositionLib internal externalPosition;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal vaultProxyAddress;

    address internal dataStoreAddress;
    IGMXV2ChainlinkPriceFeedProvider internal chainlinkPriceFeedProvider;
    IGMXV2ExchangeRouter internal exchangeRouter;
    IGMXV2Reader internal reader;
    IGMXV2RoleStore internal roleStore;

    EnzymeVersion internal version;
    uint256 internal executionFee;

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        address _dataStoreAddress,
        IGMXV2ChainlinkPriceFeedProvider _chainlinkPriceFeedProvider,
        IGMXV2Reader _reader,
        IGMXV2RoleStore _roleStore,
        uint256 _callbackGasLimit,
        IGMXV2ExchangeRouter _exchangerRouter,
        address _referralStorageAddress,
        address _uiFeeReceiverAddress
    ) internal {
        version = _version;
        exchangeRouter = _exchangerRouter;
        dataStoreAddress = _dataStoreAddress;
        roleStore = _roleStore;
        reader = _reader;
        chainlinkPriceFeedProvider = _chainlinkPriceFeedProvider;

        setUpNetworkEnvironment({_chainId: _chainId});
        executionFee = assetUnit(wrappedNativeToken) / 5;

        uint256 typeId = __deployPositionType(
            DeployPositionTypeArgs({
                wrappedNativeTokenAddress: address(wrappedNativeToken),
                dataStoreAddress: _dataStoreAddress,
                reader: _reader,
                roleStore: _roleStore,
                callbackGasLimit: _callbackGasLimit,
                referralCode: "Enzyme2024",
                referralStorageAddress: _referralStorageAddress,
                uiFeeReceiverAddress: _uiFeeReceiverAddress,
                chainlinkPriceFeedProvider: _chainlinkPriceFeedProvider
            })
        );

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        vm.prank(fundOwner);
        externalPosition = IGMXV2LeverageTradingPositionLib(
            payable(
                createExternalPositionForVersion({
                    _version: version,
                    _comptrollerProxyAddress: comptrollerProxyAddress,
                    _typeId: typeId,
                    _initializationData: ""
                })
            )
        );
    }

    // DEPLOYMENT HELPERS

    struct DeployPositionTypeArgs {
        address wrappedNativeTokenAddress;
        address dataStoreAddress;
        IGMXV2ChainlinkPriceFeedProvider chainlinkPriceFeedProvider;
        IGMXV2Reader reader;
        IGMXV2RoleStore roleStore;
        uint256 callbackGasLimit;
        bytes32 referralCode;
        address referralStorageAddress;
        address uiFeeReceiverAddress;
    }

    function __deployPositionType(DeployPositionTypeArgs memory _args) public returns (uint256 typeId_) {
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "GMXV2_V2_LEVERAGE_TRADING",
            _lib: __deployLib(_args),
            _parser: __deployParser({
                _wrappedNativeTokenAddress: _args.wrappedNativeTokenAddress,
                _dataStoreAddress: _args.dataStoreAddress,
                _reader: _args.reader
            })
        });

        return typeId_;
    }

    function __deployLib(DeployPositionTypeArgs memory _args) internal returns (address lib_) {
        bytes memory args = abi.encode(
            _args.callbackGasLimit,
            _args.dataStoreAddress,
            __deployManagedAssetsLib({
                _dataStoreAddress: _args.dataStoreAddress,
                _reader: _args.reader,
                _wrappedNativeTokenAddress: _args.wrappedNativeTokenAddress,
                _chainlinkPriceFeedProvider: _args.chainlinkPriceFeedProvider,
                _referralStorageAddress: _args.referralStorageAddress,
                _uiFeeReceiverAddress: _args.uiFeeReceiverAddress
            }),
            _args.reader,
            _args.referralCode,
            _args.referralStorageAddress,
            _args.roleStore,
            _args.uiFeeReceiverAddress,
            _args.wrappedNativeTokenAddress
        );
        return deployCode("GMXV2LeverageTradingPositionLib.sol", args);
    }

    function __deployManagedAssetsLib(
        IGMXV2ChainlinkPriceFeedProvider _chainlinkPriceFeedProvider,
        address _dataStoreAddress,
        IGMXV2Reader _reader,
        address _referralStorageAddress,
        address _uiFeeReceiverAddress,
        address _wrappedNativeTokenAddress
    ) internal returns (address lib_) {
        bytes memory args = abi.encode(
            _chainlinkPriceFeedProvider,
            _dataStoreAddress,
            _reader,
            _referralStorageAddress,
            _uiFeeReceiverAddress,
            _wrappedNativeTokenAddress
        );
        return deployCode("GMXV2LeverageTradingPositionLibManagedAssets.sol", args);
    }

    function __deployParser(address _wrappedNativeTokenAddress, address _dataStoreAddress, IGMXV2Reader _reader)
        internal
        returns (address parser_)
    {
        bytes memory args = abi.encode(_wrappedNativeTokenAddress, _dataStoreAddress, _reader);
        return deployCode("GMXV2LeverageTradingPositionParser.sol", args);
    }

    // ACTION HELPERS

    function __createOrder(IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs memory _args) internal {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: uint256(IGMXV2LeverageTradingPositionProd.Actions.CreateOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __updateOrder(IGMXV2LeverageTradingPositionProd.UpdateOrderActionArgs memory _args) internal {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: uint256(IGMXV2LeverageTradingPositionProd.Actions.UpdateOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __cancelOrder(IGMXV2LeverageTradingPositionProd.CancelOrderActionArgs memory _args) internal {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: uint256(IGMXV2LeverageTradingPositionProd.Actions.CancelOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __claimFundingFees(IGMXV2LeverageTradingPositionProd.ClaimFundingFeesActionArgs memory _args) internal {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: uint256(IGMXV2LeverageTradingPositionProd.Actions.ClaimFundingFees),
            _actionArgs: abi.encode(_args)
        });
    }

    function __claimCollateral(IGMXV2LeverageTradingPositionProd.ClaimCollateralActionArgs memory _args) internal {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: uint256(IGMXV2LeverageTradingPositionProd.Actions.ClaimCollateral),
            _actionArgs: abi.encode(_args)
        });
    }

    function __sweep() internal {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: uint256(IGMXV2LeverageTradingPositionProd.Actions.Sweep),
            _actionArgs: ""
        });
    }

    // MISC HELPERS
    function __getOrderKeeper() internal view returns (address orderKeeper_) {
        return roleStore.getRoleMembers({_roleKey: keccak256(abi.encode("ORDER_KEEPER")), _start: 0, _end: 1})[0];
    }

    function __getLiquidationKeeper() internal view returns (address orderKeeper_) {
        return roleStore.getRoleMembers({_roleKey: keccak256(abi.encode("LIQUIDATION_KEEPER")), _start: 0, _end: 1})[0];
    }

    function __getController() internal view returns (address orderKeeper_) {
        return roleStore.getRoleMembers({_roleKey: keccak256(abi.encode("CONTROLLER")), _start: 0, _end: 1})[0];
    }

    function __getLastOrderKey() internal view returns (bytes32 orderKey_) {
        bytes32[] memory orderKeys = IGMXV2DataStore(dataStoreAddress).getBytes32ValuesAt({
            _setKey: keccak256(abi.encode(keccak256(abi.encode("ACCOUNT_ORDER_LIST")), externalPosition)),
            _start: 0,
            _end: type(uint256).max
        });

        return orderKeys[orderKeys.length - 1];
    }

    function __claimableFundingAmountKey(address _market, address _token) internal view returns (bytes32 key_) {
        return keccak256(
            abi.encode(keccak256(abi.encode("CLAIMABLE_FUNDING_AMOUNT")), _market, _token, address(externalPosition))
        );
    }

    function __isAtomicOracleProviderKey(address _provider) internal pure returns (bytes32 key_) {
        return keccak256(abi.encode(keccak256(abi.encode("IS_ATOMIC_ORACLE_PROVIDER")), _provider));
    }

    function __oracleProviderForTokenKey(address _token) internal pure returns (bytes32 key_) {
        return keccak256(abi.encode(keccak256(abi.encode("ORACLE_PROVIDER_FOR_TOKEN")), _token));
    }

    function __claimableCollateralTimeDivisorKey() internal pure returns (bytes32 key_) {
        return keccak256(abi.encode("CLAIMABLE_COLLATERAL_TIME_DIVISOR"));
    }

    function __maxPositionImpactFactorKey(address _market, bool _isPositive) internal pure returns (bytes32 key_) {
        return keccak256(abi.encode(keccak256(abi.encode("MAX_POSITION_IMPACT_FACTOR")), _market, _isPositive));
    }

    function __claimableCollateralFactorKey(address _market, address _token, uint256 _timeKey)
        internal
        pure
        returns (bytes32 key_)
    {
        return keccak256(abi.encode(keccak256(abi.encode("CLAIMABLE_COLLATERAL_FACTOR")), _market, _token, _timeKey));
    }

    function __claimableCollateralAmountKey(address _market, address _token, uint256 _timeKey, address _account)
        internal
        pure
        returns (bytes32 key_)
    {
        return keccak256(
            abi.encode(keccak256(abi.encode("CLAIMABLE_COLLATERAL_AMOUNT")), _market, _token, _timeKey, _account)
        );
    }

    function __claimedCollateralAmountKey(address _market, address _token, uint256 _timeKey, address _account)
        internal
        pure
        returns (bytes32 key_)
    {
        return keccak256(
            abi.encode(keccak256(abi.encode("CLAIMED_COLLATERAL_AMOUNT")), _market, _token, _timeKey, _account)
        );
    }

    function __getMarketInfo(address _market) internal view returns (IGMXV2Market.Props memory marketInfo_) {
        return reader.getMarket({_dataStore: dataStoreAddress, _market: _market});
    }

    function __getPositions() internal view returns (IGMXV2Position.Props[] memory positions_) {
        return reader.getAccountPositions({
            _account: address(externalPosition),
            _dataStore: dataStoreAddress,
            _start: 0,
            // get all positions, end is capped to positions length inside the GMXV2Reader
            _end: type(uint256).max
        });
    }

    function __setOraclePricesForMarket(IGMXV2Market.Props memory _marketInfo)
        internal
        returns (
            IGMXV2Prices.SetPricesParams memory setPricesParams_,
            address[] memory tokens_,
            address[] memory oldOracleProviders_
        )
    {
        tokens_ = tokens_.addItem(_marketInfo.indexToken);
        tokens_ = tokens_.addUniqueItem(_marketInfo.shortToken);
        tokens_ = tokens_.addUniqueItem(_marketInfo.longToken);

        address[] memory providers = new address[](tokens_.length);
        for (uint256 i; i < tokens_.length; i++) {
            providers[i] = address(chainlinkPriceFeedProvider);
        }

        // Allow the Chainlink price provider.
        // Using the Chainlink price provider allows for easier execution of the order.
        // The original provider requires complex data constructions and signing.
        // We only care about getting the order executed.
        vm.startPrank(__getController());
        for (uint256 i; i < tokens_.length; i++) {
            oldOracleProviders_ = oldOracleProviders_.addItem(
                IGMXV2DataStore(dataStoreAddress).getAddress(__oracleProviderForTokenKey(tokens_[i]))
            );
            IGMXV2DataStore(dataStoreAddress).setAddress({
                _key: __oracleProviderForTokenKey(tokens_[i]),
                _value: address(chainlinkPriceFeedProvider)
            });
        }
        vm.stopPrank();

        return (
            IGMXV2Prices.SetPricesParams({tokens: tokens_, providers: providers, data: new bytes[](tokens_.length)}),
            tokens_,
            oldOracleProviders_
        );
    }

    function __executeOrder(bytes32 _orderKey, IGMXV2Market.Props memory _marketInfo) internal {
        (
            IGMXV2Prices.SetPricesParams memory setPricesParams,
            address[] memory tokens,
            address[] memory oldOracleProviders
        ) = __setOraclePricesForMarket(_marketInfo);

        // execute order
        vm.startPrank(__getOrderKeeper());
        exchangeRouter.orderHandler().executeOrder({_orderKey: _orderKey, _oracleParams: setPricesParams});
        vm.stopPrank();

        // bring back original oracle providers, so we can be sure that the test is not affected by the previous change
        vm.startPrank(__getController());
        for (uint256 i; i < tokens.length; i++) {
            IGMXV2DataStore(dataStoreAddress).setAddress({
                _key: __oracleProviderForTokenKey(tokens[i]),
                _value: oldOracleProviders[i]
            });
        }
        vm.stopPrank();
    }

    function __increaseMarketForUser(
        bool _isLong,
        address _user,
        address _market,
        address _initialCollateralToken,
        uint256 _initialCollateralDeltaAmount,
        uint256 _sizeDeltaUsd
    ) internal {
        address orderVault = exchangeRouter.orderHandler().orderVault();

        increaseTokenBalance({_token: wrappedNativeToken, _to: orderVault, _amount: executionFee});

        increaseTokenBalance({
            _token: IERC20(_initialCollateralToken),
            _to: orderVault,
            _amount: _initialCollateralDeltaAmount
        });

        bytes32 orderKey = exchangeRouter.createOrder(
            IGMXV2ExchangeRouter.CreateOrderParams({
                addresses: IGMXV2ExchangeRouter.CreateOrderParamsAddresses({
                    receiver: _user,
                    cancellationReceiver: address(0),
                    callbackContract: address(0),
                    uiFeeReceiver: address(0),
                    market: _market,
                    initialCollateralToken: _initialCollateralToken,
                    swapPath: new address[](0)
                }),
                numbers: IGMXV2ExchangeRouter.CreateOrderParamsNumbers({
                    sizeDeltaUsd: _sizeDeltaUsd,
                    initialCollateralDeltaAmount: _initialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: _isLong ? type(uint256).max : 0,
                    executionFee: executionFee,
                    callbackGasLimit: 0,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2Order.OrderType.MarketIncrease,
                decreasePositionSwapType: IGMXV2Order.DecreasePositionSwapType.NoSwap,
                isLong: _isLong,
                shouldUnwrapNativeToken: false,
                autoCancel: false,
                referralCode: ""
            })
        );

        __executeOrder({_orderKey: orderKey, _marketInfo: __getMarketInfo(_market)});
    }

    function __createMarketIncreaseOrder(
        address _market,
        address _initialCollateralToken,
        uint256 _initialCollateralDeltaAmount,
        uint256 _sizeDeltaUsd,
        bool _isLong
    ) internal {
        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        increaseTokenBalance({
            _token: IERC20(_initialCollateralToken),
            _to: vaultProxyAddress,
            _amount: _initialCollateralDeltaAmount
        });

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _market,
                    initialCollateralToken: _initialCollateralToken
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: _sizeDeltaUsd,
                    initialCollateralDeltaAmount: _initialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: _isLong ? type(uint256).max : 0,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketIncrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: _isLong,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );
    }

    function __createAndExecuteMarketIncreaseOrder(
        address _market,
        address _initialCollateralToken,
        uint256 _initialCollateralDeltaAmount,
        uint256 _sizeDeltaUsd,
        bool _isLong
    ) internal {
        __createMarketIncreaseOrder({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _initialCollateralDeltaAmount: _initialCollateralDeltaAmount,
            _sizeDeltaUsd: _sizeDeltaUsd,
            _isLong: _isLong
        });

        __executeOrder({_orderKey: __getLastOrderKey(), _marketInfo: __getMarketInfo(_market)});
    }

    // TESTS HELPERS
    function __test_createAndExecuteMarketIncreaseOrderAndCreateDecreaseOrder_success(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        bool _isLong,
        uint256 _triggerPrice,
        uint256 _acceptablePrice,
        uint256 _validFromTime,
        IGMXV2OrderProd.OrderType _orderType
    ) internal returns (uint256 depositedCollateralAmount_) {
        depositedCollateralAmount_ = _decreaseInitialCollateralDeltaAmount * 5;

        __createAndExecuteMarketIncreaseOrder({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _initialCollateralDeltaAmount: depositedCollateralAmount_,
            _sizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: _isLong
        });

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        vm.recordLogs();

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _market,
                    initialCollateralToken: _initialCollateralToken
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
                    triggerPrice: _triggerPrice,
                    acceptablePrice: _acceptablePrice,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: _validFromTime
                }),
                orderType: _orderType,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: _isLong,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        return depositedCollateralAmount_;
    }

    function __test_createDecreaseOrder_success(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        bool _isLong,
        uint256 _triggerPrice,
        uint256 _validFromTime,
        IGMXV2OrderProd.OrderType _orderType
    ) internal {
        uint256 depositedCollateralAmount = __test_createAndExecuteMarketIncreaseOrderAndCreateDecreaseOrder_success({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _decreaseInitialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
            _increaseOrderSizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: _isLong,
            _triggerPrice: _triggerPrice,
            _acceptablePrice: _isLong ? 0 : type(uint256).max,
            _orderType: _orderType,
            _validFromTime: _validFromTime
        });

        (address[] memory postCreateOrderManagedAssets, uint256[] memory postCreateOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        uint256 postCreateCollateralAmount = __getPositions()[0].numbers.collateralAmount;

        __executeOrder({_orderKey: __getLastOrderKey(), _marketInfo: __getMarketInfo(_market)});

        (address[] memory postExecuteOrderManagedAssets, uint256[] memory postExecuteOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        assertEq(
            postCreateOrderManagedAssets, postExecuteOrderManagedAssets, "Incorrect managedAssets post execute order"
        );

        // verify that the collateral amount is decreased by the amount specified in the decrease order
        for (uint256 i = 0; i < postExecuteOrderManagedAssetAmounts.length; i++) {
            bool isWrappedNativeToken = postExecuteOrderManagedAssets[i] == address(wrappedNativeToken);
            bool isCollateralToken = postExecuteOrderManagedAssets[i] == _initialCollateralToken;

            if (isWrappedNativeToken) {
                assertEq(
                    postExecuteOrderManagedAssetAmounts[i],
                    postCreateOrderManagedAssetAmounts[i],
                    "Incorrect managedAssetAmount wrapped native post execute order"
                );
                if (isCollateralToken) {
                    assertApproxEqRel(
                        postExecuteOrderManagedAssetAmounts[0],
                        depositedCollateralAmount + executionFee,
                        WEI_ONE_PERCENT, // 1%
                        "Incorrect managedAssetAmount post execute order"
                    ); // slight tollerance is acceptable due to the fees taken by the protocol
                }
            } else if (isCollateralToken) {
                assertEq(
                    postExecuteOrderManagedAssetAmounts[i],
                    postCreateOrderManagedAssetAmounts[i],
                    "Incorrect managedAssetAmount collateral token post execute order"
                );
                assertApproxEqRel(
                    postExecuteOrderManagedAssetAmounts[0],
                    depositedCollateralAmount,
                    WEI_ONE_PERCENT, // 1%
                    "Incorrect managedAssetAmount post execute order"
                ); // slight tollerance is acceptable due to the fees taken by the protocol
            } else {
                assertEq(
                    postExecuteOrderManagedAssetAmounts[i],
                    postCreateOrderManagedAssetAmounts[i],
                    "Incorrect managedAssetAmount token (non-wrapped native & non-collateral) post execute order"
                );
            }
        }

        // verify that position collateral amount is decreased by the amount specified in the decrease order
        assertEq(
            __getPositions()[0].numbers.collateralAmount,
            postCreateCollateralAmount - _decreaseInitialCollateralDeltaAmount,
            "Incorrect collateral amount post execute order"
        );

        // The decreased collateral should now be held by the External Position
        assertEq(
            IERC20(_initialCollateralToken).balanceOf(address(externalPosition)),
            _decreaseInitialCollateralDeltaAmount,
            "Incorrect external position collateral balance"
        );
    }

    function __test_createOrder_successMarketIncrease(
        address _market,
        address _initialCollateralToken,
        uint256 _initialCollateralDeltaAmount,
        uint256 _sizeDeltaUsd,
        bool _isLong
    ) internal {
        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        increaseTokenBalance({
            _token: IERC20(_initialCollateralToken),
            _to: vaultProxyAddress,
            _amount: _initialCollateralDeltaAmount * 5
        });

        IGMXV2Market.Props memory marketInfo = __getMarketInfo(_market);

        expectEmit(address(externalPosition));
        emit CallbackContractSet(_market);

        address[] memory trackedAssetsToAdd;
        trackedAssetsToAdd = trackedAssetsToAdd.addItem(marketInfo.longToken);
        trackedAssetsToAdd = trackedAssetsToAdd.addUniqueItem(marketInfo.shortToken);

        for (uint256 i; i < trackedAssetsToAdd.length; i++) {
            expectEmit(address(externalPosition));
            emit TrackedAssetAdded(trackedAssetsToAdd[i]);
        }

        expectEmit(address(externalPosition));
        emit TrackedMarketAdded(_market);

        vm.recordLogs();

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _market,
                    initialCollateralToken: _initialCollateralToken
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: _sizeDeltaUsd,
                    initialCollateralDeltaAmount: _initialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: _isLong ? type(uint256).max : 0,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketIncrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: _isLong,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        assertEq(externalPosition.getMarketToIsCallbackContractSet(_market), true, "Incorrect market callback contract");

        bool isCollateralWrappedNativeToken = _initialCollateralToken == address(wrappedNativeToken);

        // assert that position value takes into account pending market increase order

        (address[] memory postCreateOrderManagedAssets, uint256[] memory postCreateOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        assertEq(externalPosition.getTrackedAssets(), trackedAssetsToAdd, "Incorrect tracked assets");

        assertEq(externalPosition.getTrackedMarkets(), toArray(_market), "Incorrect tracked markets");

        assertEq(
            postCreateOrderManagedAssets,
            isCollateralWrappedNativeToken
                ? toArray(_initialCollateralToken)
                : toArray(_initialCollateralToken, address(wrappedNativeToken)),
            "Incorrect managedAssets post order create"
        );
        assertEq(
            postCreateOrderManagedAssetAmounts,
            isCollateralWrappedNativeToken
                ? toArray(_initialCollateralDeltaAmount)
                : toArray(_initialCollateralDeltaAmount, executionFee),
            "Incorrect managedAssetAmounts post order create"
        );

        // execute order

        __executeOrder({_orderKey: __getLastOrderKey(), _marketInfo: marketInfo});

        // assert that position value takes into account executed market increase order

        (address[] memory postExecuteOrderManagedAssets, uint256[] memory postExecuteOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        assertEq(
            postExecuteOrderManagedAssets,
            isCollateralWrappedNativeToken
                ? toArray(_initialCollateralToken)
                : toArray(_initialCollateralToken, address(wrappedNativeToken)),
            "Incorrect managedAssets post execute order"
        );
        assertApproxEqRel(
            postExecuteOrderManagedAssetAmounts[0],
            _initialCollateralDeltaAmount,
            WEI_ONE_PERCENT * 12 / 10, // 1.2%
            "Incorrect managedAssetAmount post execute order"
        ); // slight tolerance is acceptable due to the fees taken by the protocol
        if (!isCollateralWrappedNativeToken) {
            assertEq(
                postExecuteOrderManagedAssetAmounts[1],
                executionFee,
                "Incorrect WETH managedAssetAmount post execute order"
            );
        }

        // assert that the position was created
        assertEq(__getPositions().length, 1, "Incorrect number of positions");
    }

    function __test_createMarketDecreaseOrder_success(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        bool _isLong
    ) internal {
        __test_createDecreaseOrder_success({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _decreaseInitialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
            _increaseOrderSizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: _isLong,
            _orderType: IGMXV2OrderProd.OrderType.MarketDecrease,
            _validFromTime: 0,
            _triggerPrice: 0
        });
    }

    function __test_createOrder_successStopLoss(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        bool _isLong
    ) internal {
        __test_createDecreaseOrder_success({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _decreaseInitialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
            _increaseOrderSizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: _isLong,
            _orderType: IGMXV2OrderProd.OrderType.StopLossDecrease,
            _triggerPrice: _isLong ? type(uint256).max : 0,
            _validFromTime: block.timestamp
        });
    }

    function __test_createOrder_successLimitDecrease(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        bool _isLong
    ) internal {
        __test_createDecreaseOrder_success({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _decreaseInitialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
            _increaseOrderSizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: _isLong,
            _orderType: IGMXV2OrderProd.OrderType.LimitDecrease,
            _triggerPrice: _isLong ? 0 : type(uint256).max,
            _validFromTime: block.timestamp
        });
    }

    function __test_updateOrder_success(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        bool _isLong
    ) internal {
        uint256 oldTriggerPrice = type(uint256).max;
        uint256 oldAcceptablePrice = type(uint256).max;
        uint256 oldMinOutputAmount = 0;
        bool oldAutoCancel = false;
        uint256 oldSizeDelta = 0;

        __test_createAndExecuteMarketIncreaseOrderAndCreateDecreaseOrder_success({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _decreaseInitialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
            _increaseOrderSizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: _isLong,
            _triggerPrice: oldTriggerPrice,
            _acceptablePrice: oldAcceptablePrice,
            _orderType: IGMXV2OrderProd.OrderType.LimitDecrease,
            _validFromTime: block.timestamp
        });

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        uint256 vaultWrappedNativeTokenBalancePreUpdateOrder = IERC20(wrappedNativeToken).balanceOf(vaultProxyAddress);

        bytes32 orderKey = __getLastOrderKey();

        IGMXV2LeverageTradingPositionProd.UpdateOrderActionArgs memory updateParams = IGMXV2LeverageTradingPositionProd
            .UpdateOrderActionArgs({
            key: orderKey,
            sizeDeltaUsd: oldSizeDelta + 1,
            acceptablePrice: oldAcceptablePrice - 1,
            triggerPrice: oldTriggerPrice - 1,
            minOutputAmount: oldMinOutputAmount + 1,
            exchangeRouter: address(exchangeRouter),
            autoCancel: !oldAutoCancel,
            executionFeeIncrease: executionFee,
            validFromTime: block.timestamp + 10
        });

        vm.recordLogs();

        __updateOrder(updateParams);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // assert that values were updated

        IGMXV2Order.Props memory order = reader.getOrder({_dataStore: dataStoreAddress, _orderKey: orderKey});

        assertEq(order.numbers.sizeDeltaUsd, updateParams.sizeDeltaUsd, "Incorrect sizeUsd post update order");
        assertEq(
            order.numbers.acceptablePrice, updateParams.acceptablePrice, "Incorrect acceptablePrice post update order"
        );
        assertEq(order.numbers.triggerPrice, updateParams.triggerPrice, "Incorrect triggerPrice post update order");
        assertEq(
            order.numbers.minOutputAmount, updateParams.minOutputAmount, "Incorrect minOutputAmount post update order"
        );
        assertEq(order.flags.autoCancel, updateParams.autoCancel, "Incorrect autoCancel post update order");

        // assert that execution fee was transferred, and increased
        assertEq(
            IERC20(wrappedNativeToken).balanceOf(vaultProxyAddress),
            vaultWrappedNativeTokenBalancePreUpdateOrder - executionFee,
            "Incorrect wrappedNativeToken balance post update order"
        );
        assertEq(order.numbers.executionFee, executionFee + executionFee, "Incorrect executionFee post update order");
    }

    function __test_cancelOrder_successDecreaseOrder(
        address _market,
        address _initialCollateralToken,
        uint256 _decreaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd
    ) internal {
        // create the position, and create a pending decrease order for it
        __test_createAndExecuteMarketIncreaseOrderAndCreateDecreaseOrder_success({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _decreaseInitialCollateralDeltaAmount: _decreaseInitialCollateralDeltaAmount,
            _increaseOrderSizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: true,
            _triggerPrice: type(uint256).max,
            _acceptablePrice: type(uint256).max,
            _orderType: IGMXV2OrderProd.OrderType.LimitDecrease,
            _validFromTime: block.timestamp
        });

        uint256 vaultWrappedNativeTokenBalance = IERC20(wrappedNativeToken).balanceOf(vaultProxyAddress);

        // The external position holds a native token balance, because of the execution fee that was returned for executing the market increase order
        uint256 externalPositionNativeBalance = address(externalPosition).balance;

        (address[] memory preCancelOrderManagedAssets, uint256[] memory preCancelOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        uint256 preCancelOrderWrappedNativeTokenBalance;
        (bool found, uint256 index) = preCancelOrderManagedAssets.find(address(wrappedNativeToken));
        if (found) {
            preCancelOrderWrappedNativeTokenBalance = preCancelOrderManagedAssetAmounts[index];
        }

        vm.recordLogs();

        __cancelOrder(
            IGMXV2LeverageTradingPositionProd.CancelOrderActionArgs({
                key: __getLastOrderKey(),
                exchangeRouter: address(exchangeRouter)
            })
        );
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(wrappedNativeToken))
        });

        // assert that execution fee got back to the vault

        (address[] memory postCancelOrderManagedAssets, uint256[] memory postCancelOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        for (uint256 i; i < preCancelOrderManagedAssetAmounts.length; i++) {
            if (postCancelOrderManagedAssets[i] == address(wrappedNativeToken)) {
                assertEq(
                    postCancelOrderManagedAssetAmounts[i],
                    preCancelOrderWrappedNativeTokenBalance - externalPositionNativeBalance - executionFee,
                    "Incorrect wrapped native managedAssetAmount post cancel order"
                );
            }
        }

        assertEq(
            IERC20(wrappedNativeToken).balanceOf(vaultProxyAddress),
            vaultWrappedNativeTokenBalance + executionFee + externalPositionNativeBalance,
            "Incorrect wrappedNativeToken balance post cancel order"
        );
    }

    function __test_cancelOrder_successMarketIncrease(
        address _market,
        address _initialCollateralToken,
        uint256 _initialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd
    ) internal {
        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        increaseTokenBalance({
            _token: IERC20(_initialCollateralToken),
            _to: vaultProxyAddress,
            _amount: _initialCollateralDeltaAmount * 5
        });

        uint256 preVaultWrappedNativeTokenBalance = IERC20(wrappedNativeToken).balanceOf(vaultProxyAddress);
        uint256 preVaultCollateralTokenBalance = IERC20(_initialCollateralToken).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _market,
                    initialCollateralToken: _initialCollateralToken
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: _increaseOrderSizeDeltaUsd,
                    initialCollateralDeltaAmount: _initialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: type(uint256).max,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketIncrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        // skip 1 hour, so we can cancel the order. The order cannot be cancelled immediately after creation
        skip(SECONDS_ONE_HOUR);

        bool isCollateralWrappedNativeToken = _initialCollateralToken == address(wrappedNativeToken);

        bytes32 orderKey = __getLastOrderKey();

        vm.recordLogs();

        __cancelOrder(
            IGMXV2LeverageTradingPositionProd.CancelOrderActionArgs({
                key: orderKey,
                exchangeRouter: address(exchangeRouter)
            })
        );

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: isCollateralWrappedNativeToken
                ? toArray(address(wrappedNativeToken))
                : toArray(address(wrappedNativeToken), _initialCollateralToken)
        });

        // assert that the collateral and wrapped native token got back to the vault

        assertEq(
            IERC20(wrappedNativeToken).balanceOf(vaultProxyAddress),
            preVaultWrappedNativeTokenBalance,
            "Incorrect wrappedNativeToken balance post cancel order"
        );
        assertEq(
            IERC20(_initialCollateralToken).balanceOf(vaultProxyAddress),
            preVaultCollateralTokenBalance,
            "Incorrect collateral token balance post cancel order"
        );

        (address[] memory postCancelOrderManagedAssets, uint256[] memory postCancelOrderManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        assertEq(postCancelOrderManagedAssets.length, 0, "Incorrect managedAssets post cancel order");
        assertEq(postCancelOrderManagedAssetAmounts.length, 0, "Incorrect managedAssetAmounts post cancel order");
    }

    struct ClaimFundingFeesManagedAssets {
        address[] preGiveFundingFeesAssets;
        uint256[] preGiveFundingFeesAssetAmounts;
        address[] postGiveFundingFeesAssets;
        uint256[] postGiveFundingFeesAssetAmounts;
        address[] postClaimAssets;
        uint256[] postClaimAssetAmounts;
    }

    // pass array length of minimum 3 elements
    function __test_claimFundingFees_success(
        address[] memory _tokens,
        address[] memory _markets,
        uint256[] memory _initialCollateralDeltaAmounts,
        uint256[] memory _sizeDeltasUsd
    ) internal {
        // create pending increase order for the first market
        __createMarketIncreaseOrder({
            _market: _markets[0],
            _initialCollateralToken: _tokens[0],
            _initialCollateralDeltaAmount: _initialCollateralDeltaAmounts[0],
            _sizeDeltaUsd: _sizeDeltasUsd[0],
            _isLong: true
        });

        // create positions for the rest of markets
        for (uint256 i = 1; i < _tokens.length; i++) {
            __createAndExecuteMarketIncreaseOrder({
                _market: _markets[i],
                _initialCollateralToken: _tokens[i],
                _initialCollateralDeltaAmount: _initialCollateralDeltaAmounts[i],
                _sizeDeltaUsd: _sizeDeltasUsd[i],
                _isLong: true
            });
        }

        ClaimFundingFeesManagedAssets memory managedAssets = ClaimFundingFeesManagedAssets({
            preGiveFundingFeesAssets: new address[](0),
            preGiveFundingFeesAssetAmounts: new uint256[](0),
            postGiveFundingFeesAssets: new address[](0),
            postGiveFundingFeesAssetAmounts: new uint256[](0),
            postClaimAssets: new address[](0),
            postClaimAssetAmounts: new uint256[](0)
        });

        // get only unique markets
        address[] memory uniqueMarkets;
        for (uint256 i; i < _markets.length; i++) {
            uniqueMarkets = uniqueMarkets.addUniqueItem(_markets[i]);
        }

        // there shouldn't be any duplicated markets, only unique ones
        assertEq(externalPosition.getTrackedMarkets(), uniqueMarkets, "Incorrect tracked markets post create");

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        // create and execute market decrease by withdrawing the position from the second market (markets[1])
        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _markets[1],
                    initialCollateralToken: _tokens[1]
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: _sizeDeltasUsd[1],
                    initialCollateralDeltaAmount: _initialCollateralDeltaAmounts[1],
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketDecrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        __executeOrder({_orderKey: __getLastOrderKey(), _marketInfo: __getMarketInfo(_markets[1])});

        (managedAssets.preGiveFundingFeesAssets, managedAssets.preGiveFundingFeesAssetAmounts) =
            externalPosition.getManagedAssets();

        uint256[] memory rewardAmounts = new uint256[](_tokens.length);
        // set some funding fees to be claimed
        vm.startPrank(__getController());
        for (uint256 i; i < _tokens.length; i++) {
            IGMXV2DataStore(dataStoreAddress).setUint({
                _key: __claimableFundingAmountKey({_market: _markets[i], _token: _tokens[i]}),
                _value: 123 * i
                    + IGMXV2DataStore(dataStoreAddress).getUint(
                        __claimableFundingAmountKey({_market: _markets[i], _token: _tokens[i]})
                    )
            });
            rewardAmounts[i] = 123 * i;
        }
        vm.stopPrank();

        (address[] memory aggregatedRewardAssets, uint256[] memory aggregatedRewardAmounts) =
            aggregateAssetAmounts({_rawAssets: _tokens, _rawAmounts: rewardAmounts, _ceilingAtMax: false});

        (managedAssets.postGiveFundingFeesAssets, managedAssets.postGiveFundingFeesAssetAmounts) =
            externalPosition.getManagedAssets();

        // claimable funding fees must be included in the managed assets
        for (uint256 i; i < aggregatedRewardAssets.length; i++) {
            (, uint256 managedAssetIndex) = managedAssets.postGiveFundingFeesAssets.find(aggregatedRewardAssets[i]);

            assertEq(
                managedAssets.preGiveFundingFeesAssetAmounts[managedAssetIndex] + aggregatedRewardAmounts[i],
                managedAssets.postGiveFundingFeesAssetAmounts[managedAssetIndex],
                "Incorrect managedAssetAmount post give funding fees"
            );
        }

        uint256[] memory preClaimVaultTokenBalances = new uint256[](aggregatedRewardAssets.length);
        for (uint256 i; i < aggregatedRewardAssets.length; i++) {
            preClaimVaultTokenBalances[i] = IERC20(aggregatedRewardAssets[i]).balanceOf(vaultProxyAddress);
        }

        // Check if the decreased market is unique within the markets array
        bool wasRemovedMarketUnique = !_markets.removeAtIndex(1).contains(_markets[1]);

        // if the removed market was unique, then the TrackedMarketRemoved event should be emitted
        if (wasRemovedMarketUnique) {
            expectEmit(address(externalPosition));
            emit TrackedMarketRemoved(_markets[1]);
        }

        vm.recordLogs();

        __claimFundingFees(
            IGMXV2LeverageTradingPositionProd.ClaimFundingFeesActionArgs({
                tokens: _tokens,
                markets: _markets,
                exchangeRouter: address(exchangeRouter)
            })
        );

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: _tokens
        });

        // if the removed market was unique, then the market should be removed from the markets array
        assertEq(
            externalPosition.getTrackedMarkets(),
            wasRemovedMarketUnique ? _markets.removeAtIndex(1) : uniqueMarkets,
            "Incorrect tracked markets post claim"
        );

        (managedAssets.postClaimAssets, managedAssets.postClaimAssetAmounts) = externalPosition.getManagedAssets();

        // rewards should be claimed at this point, and the managed assets should be as they were before the rewards were given
        assertEq(
            managedAssets.postClaimAssets,
            managedAssets.postGiveFundingFeesAssets,
            "Incorrect managedAssets post claim funding fees"
        );

        // verify that the funding fees were claimed, and got back to the vault
        for (uint256 i; i < aggregatedRewardAssets.length; i++) {
            assertEq(
                IERC20(aggregatedRewardAssets[i]).balanceOf(vaultProxyAddress),
                preClaimVaultTokenBalances[i] + aggregatedRewardAmounts[i],
                "Incorrect token balance post claim funding fees"
            );
        }
    }

    function __test_afterOrderExecution_successAfterOrderExecutionIsCalledOnLiquidation(
        address _market,
        address _initialCollateralToken,
        uint256 _increaseInitialCollateralDeltaAmount,
        uint256 _increaseOrderSizeDeltaUsd,
        IGMXV2LiquidationHandler _liquidationHandler
    ) internal {
        // when creating a market increase order, the liquidation callback should be set
        __createAndExecuteMarketIncreaseOrder({
            _market: _market,
            _initialCollateralToken: _initialCollateralToken,
            _initialCollateralDeltaAmount: _increaseInitialCollateralDeltaAmount,
            _sizeDeltaUsd: _increaseOrderSizeDeltaUsd,
            _isLong: true
        });

        IGMXV2Market.Props memory marketInfo = __getMarketInfo(_market);
        address[] memory tokens;
        tokens = tokens.addItem(marketInfo.indexToken);
        tokens = tokens.addUniqueItem(marketInfo.shortToken);
        tokens = tokens.addUniqueItem(marketInfo.longToken);

        vm.startPrank(__getController());
        // set chainlink price feed provider as oracle provider
        for (uint256 i; i < tokens.length; i++) {
            IGMXV2DataStore(dataStoreAddress).setAddress({
                _key: __oracleProviderForTokenKey(tokens[i]),
                _value: address(chainlinkPriceFeedProvider)
            });
        }
        // turn off validation of provider with actual chainlink price feed
        IGMXV2DataStore(dataStoreAddress).setBool({
            _key: __isAtomicOracleProviderKey(address(chainlinkPriceFeedProvider)),
            _value: true
        });
        vm.stopPrank();

        // mock responses from the chainlink price feed provider to return some extremely small price to facilitate liquidations
        for (uint256 i; i < tokens.length; i++) {
            vm.mockCall({
                callee: address(chainlinkPriceFeedProvider),
                data: abi.encodeWithSelector(IGMXV2ChainlinkPriceFeedProvider.getOraclePrice.selector, tokens[i], ""),
                returnData: abi.encode(
                    IGMXV2ChainlinkPriceFeedProvider.ValidatedPrice({
                        token: tokens[i],
                        min: 1,
                        max: 2,
                        timestamp: block.timestamp,
                        provider: address(chainlinkPriceFeedProvider)
                    })
                )
            });
        }

        address[] memory providers = new address[](tokens.length);
        for (uint256 i; i < tokens.length; i++) {
            providers[i] = address(chainlinkPriceFeedProvider);
        }

        IGMXV2Prices.SetPricesParams memory setPricesParams =
            IGMXV2Prices.SetPricesParams({tokens: tokens, providers: providers, data: new bytes[](tokens.length)});

        // expect the callback to be called when a liquidation is executed
        vm.expectCall({
            callee: address(externalPosition),
            data: abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.afterOrderExecution.selector)
        });

        // execute liquidation
        vm.startPrank(__getLiquidationKeeper());
        _liquidationHandler.executeLiquidation({
            _account: address(externalPosition),
            _market: _market,
            _collateralToken: _initialCollateralToken,
            _isLong: true,
            _oracleParams: setPricesParams
        });
        vm.stopPrank();
    }

    function __executeOrderAndExpectClaimableCollateralAddedEmit(
        address _market,
        address _initialCollateralToken,
        uint256 _timeKey
    ) internal {
        (IGMXV2Prices.SetPricesParams memory setPricesParams,,) = __setOraclePricesForMarket(__getMarketInfo(_market));

        // execute order
        vm.startPrank(__getOrderKeeper());

        IGMXV2OrderHandler orderHandler = exchangeRouter.orderHandler();

        expectEmit(address(externalPosition));
        emit ClaimableCollateralAdded({
            market: _market,
            token: _initialCollateralToken,
            timeKey: _timeKey,
            claimableCollateralKey: __claimableCollateralAmountKey({
                _market: _market,
                _token: _initialCollateralToken,
                _timeKey: _timeKey,
                _account: address(externalPosition)
            })
        });
        orderHandler.executeOrder({_orderKey: __getLastOrderKey(), _oracleParams: setPricesParams});
        vm.stopPrank();
    }

    struct ClaimCollateralSuccessArgs {
        address market;
        address initialCollateralLongToken;
        uint256 increaseInitialCollateralDeltaAmount;
        uint256 increaseOrderSizeDeltaUsd;
        address userShortToken;
        uint256 userShortTokenDeltaAmount;
        uint256 userShortTokenSizeDeltaUsd;
    }

    function __test_claimCollateral_success(ClaimCollateralSuccessArgs memory _args) internal {
        // set negative impact factor to 1 wei so that negative price impact exceeds threshold.
        // negative impact factor < negative price impact is necessary for claimable collateral to accrue
        vm.startPrank(__getController());
        IGMXV2DataStore(dataStoreAddress).setUint(__maxPositionImpactFactorKey(_args.market, false), 1);
        vm.stopPrank();

        __createAndExecuteMarketIncreaseOrder({
            _market: _args.market,
            _initialCollateralToken: _args.initialCollateralLongToken,
            _initialCollateralDeltaAmount: _args.increaseInitialCollateralDeltaAmount,
            _sizeDeltaUsd: _args.increaseOrderSizeDeltaUsd,
            _isLong: true
        });

        // disbalance the pool with by opening an opposite position (short)
        __increaseMarketForUser({
            _market: _args.market,
            _initialCollateralToken: _args.userShortToken,
            _initialCollateralDeltaAmount: _args.userShortTokenDeltaAmount,
            _sizeDeltaUsd: _args.userShortTokenSizeDeltaUsd,
            _user: makeAddr("user 1"),
            _isLong: false
        });

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _args.market,
                    initialCollateralToken: _args.initialCollateralLongToken
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: _args.increaseOrderSizeDeltaUsd,
                    initialCollateralDeltaAmount: _args.increaseInitialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketDecrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        uint256 timeKey =
            block.timestamp / IGMXV2DataStore(dataStoreAddress).getUint(__claimableCollateralTimeDivisorKey());

        __executeOrderAndExpectClaimableCollateralAddedEmit({
            _market: _args.market,
            _initialCollateralToken: _args.initialCollateralLongToken,
            _timeKey: timeKey
        });

        __sweep(); // sweep the outstanding execution fee

        bytes32 claimableCollateralKey = externalPosition.getClaimableCollateralKeys()[0];

        assertEq(
            externalPosition.getClaimableCollateralKeys().length, 1, "Incorrect number of claimable collateral keys"
        );

        assertEq(
            externalPosition.getClaimableCollateralKeyToClaimableCollateralInfo(claimableCollateralKey).token,
            _args.initialCollateralLongToken,
            "Incorrect claimable collateral info token"
        );

        (address[] memory preClaimManagedAssets, uint256[] memory preClaimManagedAssetAmounts) =
            externalPosition.getManagedAssets();

        assertEq(preClaimManagedAssets.length, 1, "Incorrect number of managed assets pre claim");

        uint256 preClaimVaultTokenBalance = IERC20(_args.initialCollateralLongToken).balanceOf(vaultProxyAddress);

        // allow claiming full collateral
        vm.startPrank(__getController());
        IGMXV2DataStore(dataStoreAddress).setUint(
            __claimableCollateralFactorKey({
                _market: _args.market,
                _token: _args.initialCollateralLongToken,
                _timeKey: timeKey
            }),
            GMX_ONE_USD_UNIT
        );
        vm.stopPrank();

        vm.recordLogs();

        expectEmit(address(externalPosition));
        emit ClaimableCollateralRemoved(claimableCollateralKey);

        __claimCollateral(
            IGMXV2LeverageTradingPositionProd.ClaimCollateralActionArgs({
                markets: toArray(_args.market),
                tokens: toArray(_args.initialCollateralLongToken),
                timeKeys: toArray(timeKey),
                exchangeRouter: address(exchangeRouter)
            })
        );

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(_args.initialCollateralLongToken)
        });

        uint256 claimableCollateral = IGMXV2DataStore(dataStoreAddress).getUint(claimableCollateralKey);

        assertEq(
            IGMXV2DataStore(dataStoreAddress).getUint(
                __claimedCollateralAmountKey({
                    _market: _args.market,
                    _token: _args.initialCollateralLongToken,
                    _timeKey: timeKey,
                    _account: address(externalPosition)
                })
            ),
            claimableCollateral,
            "Collateral not claimed"
        );

        (, uint256[] memory postClaimManagedAssetAmounts) = externalPosition.getManagedAssets();

        uint256 postExpectedClaimableCollateral = preClaimManagedAssetAmounts[0] - claimableCollateral;
        assertEq(
            postExpectedClaimableCollateral == 0 ? new uint256[](0) : toArray(postExpectedClaimableCollateral),
            postClaimManagedAssetAmounts,
            "Incorrect managed assets post claim"
        );

        assertEq(
            IERC20(_args.initialCollateralLongToken).balanceOf(vaultProxyAddress),
            preClaimVaultTokenBalance + claimableCollateral,
            "Incorrect vault token balance post claim"
        );

        assertEq(
            externalPosition.getClaimableCollateralKeys().length,
            0,
            "Incorrect number of claimable collateral keys post claim"
        );

        assertEq(
            externalPosition.getClaimableCollateralKeyToClaimableCollateralInfo(claimableCollateralKey).token,
            address(0),
            "Incorrect claimable collateral info token post claim"
        );
    }

    // TESTS

    function test_receiveCallFromVault_failsInvalidActionId() public {
        vm.expectRevert(IGMXV2LeverageTradingPositionLib.InvalidActionId.selector);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(externalPosition),
            _actionId: 12,
            _actionArgs: ""
        });
    }

    function test_createOrder_failsInvalidOrderType() public {
        IGMXV2OrderProd.OrderType notSupportedOrderType = IGMXV2OrderProd.OrderType.Liquidation;

        vm.expectRevert(
            abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidOrderType.selector, notSupportedOrderType)
        );

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: address(0),
                    initialCollateralToken: address(0)
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: 0,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: 0,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: notSupportedOrderType,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );
    }

    function test_createOrder_failsInvalidHandlerForCallingAnAction() public {
        address fakeHandler = makeAddr("fake handler");

        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidHandler.selector));

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: address(0),
                    initialCollateralToken: address(0)
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: 0,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: 0,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketDecrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: fakeHandler
            })
        );
    }

    function test_updateOrder_failsInvalidHandlerForCallingAnAction() public {
        address fakeHandler = makeAddr("fake handler");

        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidHandler.selector));

        __updateOrder(
            IGMXV2LeverageTradingPositionProd.UpdateOrderActionArgs({
                key: 0,
                sizeDeltaUsd: 0,
                acceptablePrice: 0,
                triggerPrice: 0,
                minOutputAmount: 0,
                exchangeRouter: fakeHandler,
                autoCancel: false,
                executionFeeIncrease: 0,
                validFromTime: 0
            })
        );
    }

    function test_cancelOrder_failsInvalidHandlerForCallingAnAction() public {
        address fakeHandler = makeAddr("fake handler");

        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidHandler.selector));

        __cancelOrder(IGMXV2LeverageTradingPositionProd.CancelOrderActionArgs({key: 0, exchangeRouter: fakeHandler}));
    }

    function test_claimFundingFees_failsInvalidHandlerForCallingAnAction() public {
        address fakeHandler = makeAddr("fake handler");

        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidHandler.selector));

        __claimFundingFees(
            IGMXV2LeverageTradingPositionProd.ClaimFundingFeesActionArgs({
                exchangeRouter: fakeHandler,
                markets: new address[](0),
                tokens: new address[](0)
            })
        );
    }

    function test_claimCollateral_failsInvalidHandlerForCallingAnAction() public {
        address fakeHandler = makeAddr("fake handler");

        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidHandler.selector));

        __claimCollateral(
            IGMXV2LeverageTradingPositionProd.ClaimCollateralActionArgs({
                exchangeRouter: fakeHandler,
                markets: new address[](0),
                tokens: new address[](0),
                timeKeys: new uint256[](0)
            })
        );
    }

    function test_afterOrderExecution_failsInvalidHandlerForCallback() public {
        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidHandler.selector));

        externalPosition.afterOrderExecution(
            "",
            IGMXV2LeverageTradingPositionLib.Props({
                addresses: IGMXV2LeverageTradingPositionLib.Addresses({
                    account: address(0),
                    receiver: address(0),
                    cancellationReceiver: address(0),
                    callbackContract: address(0),
                    uiFeeReceiver: address(0),
                    market: address(0),
                    initialCollateralToken: address(0),
                    swapPath: new address[](0)
                }),
                numbers: IGMXV2LeverageTradingPositionLib.Numbers({
                    orderType: IGMXV2LeverageTradingPositionLib.OrderType.wrap(0),
                    decreasePositionSwapType: IGMXV2LeverageTradingPositionLib.DecreasePositionSwapType.wrap(0),
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: 0,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: 0,
                    callbackGasLimit: 0,
                    minOutputAmount: 0,
                    updatedAtTime: 0,
                    validFromTime: 0
                }),
                flags: IGMXV2LeverageTradingPositionLib.Flags({
                    isLong: true,
                    shouldUnwrapNativeToken: true,
                    isFrozen: true,
                    autoCancel: true
                })
            }),
            IGMXV2LeverageTradingPositionLib.EventLogData({
                addressItems: IGMXV2LeverageTradingPositionLib.AddressItems({
                    items: new IGMXV2LeverageTradingPositionLib.AddressKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.AddressArrayKeyValue[](0)
                }),
                uintItems: IGMXV2LeverageTradingPositionLib.UintItems({
                    items: new IGMXV2LeverageTradingPositionLib.UintKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.UintArrayKeyValue[](0)
                }),
                intItems: IGMXV2LeverageTradingPositionLib.IntItems({
                    items: new IGMXV2LeverageTradingPositionLib.IntKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.IntArrayKeyValue[](0)
                }),
                boolItems: IGMXV2LeverageTradingPositionLib.BoolItems({
                    items: new IGMXV2LeverageTradingPositionLib.BoolKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.BoolArrayKeyValue[](0)
                }),
                bytesItems: IGMXV2LeverageTradingPositionLib.BytesItems({
                    items: new IGMXV2LeverageTradingPositionLib.BytesKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.BytesArrayKeyValue[](0)
                }),
                bytes32Items: IGMXV2LeverageTradingPositionLib.Bytes32Items({
                    items: new IGMXV2LeverageTradingPositionLib.Bytes32KeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.Bytes32ArrayKeyValue[](0)
                }),
                stringItems: IGMXV2LeverageTradingPositionLib.StringItems({
                    items: new IGMXV2LeverageTradingPositionLib.StringKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.StringArrayKeyValue[](0)
                })
            })
        );
    }

    function test_afterOrderExecution_failsInvalidCallbackAccount() public {
        vm.expectRevert(abi.encodeWithSelector(IGMXV2LeverageTradingPositionLib.InvalidCallbackAccount.selector));

        vm.prank(address(exchangeRouter));
        externalPosition.afterOrderExecution(
            "",
            IGMXV2LeverageTradingPositionLib.Props({
                addresses: IGMXV2LeverageTradingPositionLib.Addresses({
                    account: makeAddr("invalid account"),
                    receiver: address(0),
                    cancellationReceiver: address(0),
                    callbackContract: address(0),
                    uiFeeReceiver: address(0),
                    market: address(0),
                    initialCollateralToken: address(0),
                    swapPath: new address[](0)
                }),
                numbers: IGMXV2LeverageTradingPositionLib.Numbers({
                    orderType: IGMXV2LeverageTradingPositionLib.OrderType.wrap(0),
                    decreasePositionSwapType: IGMXV2LeverageTradingPositionLib.DecreasePositionSwapType.wrap(0),
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: 0,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: 0,
                    callbackGasLimit: 0,
                    minOutputAmount: 0,
                    updatedAtTime: 0,
                    validFromTime: 0
                }),
                flags: IGMXV2LeverageTradingPositionLib.Flags({
                    isLong: true,
                    shouldUnwrapNativeToken: true,
                    isFrozen: true,
                    autoCancel: true
                })
            }),
            IGMXV2LeverageTradingPositionLib.EventLogData({
                addressItems: IGMXV2LeverageTradingPositionLib.AddressItems({
                    items: new IGMXV2LeverageTradingPositionLib.AddressKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.AddressArrayKeyValue[](0)
                }),
                uintItems: IGMXV2LeverageTradingPositionLib.UintItems({
                    items: new IGMXV2LeverageTradingPositionLib.UintKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.UintArrayKeyValue[](0)
                }),
                intItems: IGMXV2LeverageTradingPositionLib.IntItems({
                    items: new IGMXV2LeverageTradingPositionLib.IntKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.IntArrayKeyValue[](0)
                }),
                boolItems: IGMXV2LeverageTradingPositionLib.BoolItems({
                    items: new IGMXV2LeverageTradingPositionLib.BoolKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.BoolArrayKeyValue[](0)
                }),
                bytesItems: IGMXV2LeverageTradingPositionLib.BytesItems({
                    items: new IGMXV2LeverageTradingPositionLib.BytesKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.BytesArrayKeyValue[](0)
                }),
                bytes32Items: IGMXV2LeverageTradingPositionLib.Bytes32Items({
                    items: new IGMXV2LeverageTradingPositionLib.Bytes32KeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.Bytes32ArrayKeyValue[](0)
                }),
                stringItems: IGMXV2LeverageTradingPositionLib.StringItems({
                    items: new IGMXV2LeverageTradingPositionLib.StringKeyValue[](0),
                    arrayItems: new IGMXV2LeverageTradingPositionLib.StringArrayKeyValue[](0)
                })
            })
        );
    }

    function __test_getManagedAssets_successValuationOfOpenPosition(
        address _nonWethAgainstStablecoinMarket // choose non-weth market, so the test results won't be affected by the execution fee returns. Example market WBTC-USDC
    ) internal {
        // initial conditions
        uint256 shortTokenInitialCollateralDeltaAmount = 1000; // this will be some stablecoin, like USDC
        uint256 leverage = 100; // 100 is maximum leverage, so the the conditions are the most extreme as possible
        IGMXV2Market.Props memory marketInfo = __getMarketInfo(_nonWethAgainstStablecoinMarket);

        IGMXV2ChainlinkPriceFeedProvider.ValidatedPrice memory shortTokenPrice =
            chainlinkPriceFeedProvider.getOraclePrice(marketInfo.shortToken, "");
        IGMXV2ChainlinkPriceFeedProvider.ValidatedPrice memory longTokenPrice =
            chainlinkPriceFeedProvider.getOraclePrice(marketInfo.longToken, "");

        uint256 initialCollateralDeltaAmount =
            shortTokenInitialCollateralDeltaAmount * assetUnit(IERC20(marketInfo.shortToken));

        // 1. Create long position of short token
        __createAndExecuteMarketIncreaseOrder({
            _market: _nonWethAgainstStablecoinMarket,
            _initialCollateralToken: marketInfo.shortToken,
            _initialCollateralDeltaAmount: initialCollateralDeltaAmount,
            _sizeDeltaUsd: shortTokenInitialCollateralDeltaAmount * leverage * GMX_ONE_USD_UNIT,
            _isLong: true
        });

        // 2. Sweep just to clean up the position from WETH (left from executionFee), or any leftover of the Stablecoin that could be there, so we are sure that the external position doesn't hold any Stablecoin besides the hold position
        __sweep();

        // 3. Check the managed assets value of shortToken before closing the position
        (address[] memory prePositionCloseManagedAssets, uint256[] memory prePositionCloseManagedAssetAmounts) =
            externalPosition.getManagedAssets();
        assertEq(prePositionCloseManagedAssets, toArray(marketInfo.shortToken), "Incorrect pre close managed assets");

        // 4. Close the position from step 1
        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: _nonWethAgainstStablecoinMarket,
                    initialCollateralToken: marketInfo.shortToken
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: shortTokenInitialCollateralDeltaAmount * leverage * GMX_ONE_USD_UNIT,
                    initialCollateralDeltaAmount: type(uint256).max,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketDecrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        __executeOrder({_orderKey: __getLastOrderKey(), _marketInfo: __getMarketInfo(_nonWethAgainstStablecoinMarket)});

        (address[] memory postClosePositionsManagedAssets,) = externalPosition.getManagedAssets();

        assertEq(
            postClosePositionsManagedAssets,
            toArray(marketInfo.longToken, marketInfo.shortToken, address(wethToken)),
            "Incorrect post close managed assets"
        );

        // 5. Sweep to get the short market token, long market token, and WETH back to the vault
        __sweep();

        // 6. Compare Vault balances value after closing the position with the short token value that got transferred to the vault
        assertApproxEqRel(
            IERC20(marketInfo.shortToken).balanceOf(vaultProxyAddress) * shortTokenPrice.min
                + IERC20(marketInfo.longToken).balanceOf(vaultProxyAddress) * longTokenPrice.min,
            prePositionCloseManagedAssetAmounts[0] * shortTokenPrice.min,
            WEI_ONE_PERCENT / 1000, // 0.001 % tolerance
            "Incorrect vault proxy balances"
        );
    }
}

abstract contract GMXV2LeverageTradingPositionTestBaseArbitrum is TestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ARBITRUM_CHAIN_ID,
            _dataStoreAddress: ARBITRUM_GMXV2_DATA_STORE_ADDRESS,
            _reader: ARBITRUM_GMXV2_READER,
            _roleStore: ARBITRUM_GMXV2_ROLE_STORE,
            _callbackGasLimit: 750_000, // 3 times more than the measured value for being safe that it will not revert, because of out-of-gas error
            _exchangerRouter: ARBITRUM_GMXV2_EXCHANGE_ROUTER,
            _referralStorageAddress: ARBITRUM_GMXV2_REFERRAL_STORAGE_ADDRESS,
            _uiFeeReceiverAddress: address(0),
            _chainlinkPriceFeedProvider: ARBITRUM_GMXV2_CHAINLINK_PRICE_FEED_PROVIDER,
            _version: _version
        });
    }

    // market increase

    function test_createOrder_successMarketIncreaseETH_USD_WETH_USDC_USDCCollateralLong() public {
        __test_createOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_USDC,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _initialCollateralDeltaAmount: 100 * assetUnit(IERC20(ARBITRUM_USDC)),
            _sizeDeltaUsd: 400 * GMX_ONE_USD_UNIT, // 400 USD, 4x leverage
            _isLong: true
        });
    }

    function test_createOrder_successMarketIncreaseETH_USD_WETH_USDC_USDCCollateralShort() public {
        __test_createOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_USDC,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _initialCollateralDeltaAmount: 100 * assetUnit(IERC20(ARBITRUM_USDC)),
            _sizeDeltaUsd: 400 * GMX_ONE_USD_UNIT, // 400 USD, 4x leverage
            _isLong: false
        });
    }

    function test_createOrder_successMarketIncreaseETH_USD_WETH_USDC_WETHCollateralLong() public {
        __test_createOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _initialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _sizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT, // 10k USD
            _isLong: true
        });
    }

    function test_createOrder_successMarketIncreaseETH_USD_WETH_WETH_WETHCollateralLong() public {
        __test_createOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH,
            _initialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _sizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT, // 10k USD
            _isLong: true
        });
    }

    function test_createOrder_successMarketIncreaseBTC_USD_WBTC_WBTC_WBTC_CollateralShort() public {
        __test_createOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_WBTC,
            _market: ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC,
            _initialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WBTC)),
            _sizeDeltaUsd: 60_000 * GMX_ONE_USD_UNIT, // 60k USD
            _isLong: false
        });
    }

    // market decrease

    function test_createOrder_successMarketDecreaseETH_USD_WETH_USDC_USDCCollateralLong() public {
        __test_createMarketDecreaseOrder_success({
            _initialCollateralToken: ARBITRUM_USDC,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _decreaseInitialCollateralDeltaAmount: 100 * assetUnit(IERC20(ARBITRUM_USDC)),
            _increaseOrderSizeDeltaUsd: 400 * GMX_ONE_USD_UNIT, // 400 USD
            _isLong: true
        });
    }

    function test_createOrder_successMarketDecreaseBTC_USD_WBTC_WBTC_WBTC_CollateralShort() public {
        __test_createMarketDecreaseOrder_success({
            _initialCollateralToken: ARBITRUM_WBTC,
            _market: ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC,
            _decreaseInitialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WBTC)),
            _increaseOrderSizeDeltaUsd: 300_000 * GMX_ONE_USD_UNIT, // 300k USD
            _isLong: false
        });
    }

    // stop loss

    function test_createOrder_successStopLossETH_USD_WETH_USDC_USDCCollateralLong() public {
        __test_createOrder_successStopLoss({
            _initialCollateralToken: ARBITRUM_USDC,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _decreaseInitialCollateralDeltaAmount: 100 * assetUnit(IERC20(ARBITRUM_USDC)),
            _increaseOrderSizeDeltaUsd: 400 * GMX_ONE_USD_UNIT, // 400 USD
            _isLong: true
        });
    }

    function test_createOrder_successStopLossETH_USD_WETH_USDC_WETHCollateralShort() public {
        __test_createOrder_successStopLoss({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _decreaseInitialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _increaseOrderSizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT, // 10k USD
            _isLong: false
        });
    }

    // limit decrease

    function test_createOrder_successLimitDecreaseBTC_USD_WBTC_WBTC_WBTC_CollateralLong() public {
        __test_createOrder_successLimitDecrease({
            _initialCollateralToken: ARBITRUM_WBTC,
            _market: ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC,
            _decreaseInitialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WBTC)),
            _increaseOrderSizeDeltaUsd: 300_000 * GMX_ONE_USD_UNIT, // 300k USD
            _isLong: true
        });
    }

    function test_createLimitDecreaseOrderETH_USD_WETH_USDC_WETHCollateralShort_success() public {
        __test_createOrder_successLimitDecrease({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _decreaseInitialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _increaseOrderSizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT, // 10k USD
            _isLong: false
        });
    }

    // update order

    function test_updateOrder_successBTC_USD_WBTC_WBTC_WBTC_CollateralShort() public {
        __test_updateOrder_success({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _decreaseInitialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _increaseOrderSizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT, // 10k USD
            _isLong: false
        });
    }

    // cancel order

    function test_cancelOrder_successDecreaseOrderETH_USD_WETH_USDC_WETHCollateral() public {
        __test_cancelOrder_successDecreaseOrder({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _decreaseInitialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _increaseOrderSizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT // 10k USD
        });
    }

    function test_cancelOrder_successMarketIncreaseETH_USD_WETH_WETH_WETHCollateral() public {
        __test_cancelOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_WETH,
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH,
            _initialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WETH)),
            _increaseOrderSizeDeltaUsd: 10_000 * GMX_ONE_USD_UNIT // 10k USD
        });
    }

    function test_cancelMarketIncreaseOrderBTC_USD_WBTC_WBTC_WBTC_Collateral_success() public {
        __test_cancelOrder_successMarketIncrease({
            _initialCollateralToken: ARBITRUM_WBTC,
            _market: ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC,
            _initialCollateralDeltaAmount: assetUnit(IERC20(ARBITRUM_WBTC)),
            _increaseOrderSizeDeltaUsd: 60_000 * GMX_ONE_USD_UNIT // 60k USD
        });
    }

    // claim funding fees

    function test_claimFundingFees_successUniqueMarkets() public {
        __test_claimFundingFees_success({
            _tokens: toArray(ARBITRUM_USDC, ARBITRUM_WETH, ARBITRUM_WBTC),
            _markets: toArray(
                ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
                ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH,
                ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC
            ),
            _initialCollateralDeltaAmounts: toArray(
                100 * assetUnit(IERC20(ARBITRUM_USDC)),
                2 * assetUnit(IERC20(ARBITRUM_WETH)),
                assetUnit(IERC20(ARBITRUM_WBTC))
            ),
            _sizeDeltasUsd: toArray(200 * GMX_ONE_USD_UNIT, 20_000 * GMX_ONE_USD_UNIT, 60_000 * GMX_ONE_USD_UNIT)
        });
    }

    function test_claimFundingFees_successNotUniqueMarkets() public {
        __test_claimFundingFees_success({
            _tokens: toArray(ARBITRUM_USDC, ARBITRUM_WETH, ARBITRUM_WETH, ARBITRUM_WBTC),
            _markets: toArray(
                ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
                ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH,
                ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH,
                ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC
            ),
            _initialCollateralDeltaAmounts: toArray(
                assetUnit(IERC20(ARBITRUM_WETH)),
                2 * assetUnit(IERC20(ARBITRUM_WETH)),
                4 * assetUnit(IERC20(ARBITRUM_WETH)),
                assetUnit(IERC20(ARBITRUM_WBTC))
            ),
            _sizeDeltasUsd: toArray(
                10_000 * GMX_ONE_USD_UNIT, 20_000 * GMX_ONE_USD_UNIT, 40_000 * GMX_ONE_USD_UNIT, 60_000 * GMX_ONE_USD_UNIT
            )
        });
    }

    // sweep

    // test plan
    // 1. create and execute market increase order
    // 2. create and execute market decrease order
    // 3. create market increase order that will be cancelled
    // 4. create market increase order that will be pending
    // 5. test sweep
    function test_sweep_success() public {
        // market increase

        uint256 wbtcAssetIncrease = 2 * assetUnit(IERC20(ARBITRUM_WBTC));

        __createAndExecuteMarketIncreaseOrder({
            _market: ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC,
            _initialCollateralToken: ARBITRUM_WBTC,
            _initialCollateralDeltaAmount: wbtcAssetIncrease,
            _sizeDeltaUsd: 120_000 * GMX_ONE_USD_UNIT, // 120k USD
            _isLong: true
        });

        // market decrease

        uint256 wbtcAssetDecrease = wbtcAssetIncrease / 4;

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC,
                    initialCollateralToken: ARBITRUM_WBTC
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: wbtcAssetDecrease,
                    triggerPrice: 0,
                    acceptablePrice: 0,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketDecrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        __executeOrder({
            _orderKey: __getLastOrderKey(),
            _marketInfo: __getMarketInfo(ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_WBTC)
        });

        // order cancelled

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        uint256 pendingIncreaseOrderInitialCollateralDeltaAmount = 5 * assetUnit(IERC20(ARBITRUM_WETH));

        increaseTokenBalance({
            _token: IERC20(ARBITRUM_WETH),
            _to: vaultProxyAddress,
            _amount: pendingIncreaseOrderInitialCollateralDeltaAmount
        });

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_WETH,
                    initialCollateralToken: ARBITRUM_WETH
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: 30_000 * GMX_ONE_USD_UNIT, // 30k USD,
                    initialCollateralDeltaAmount: pendingIncreaseOrderInitialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: type(uint256).max,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketIncrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        // order pending

        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: executionFee});

        uint256 cancelledOrderInitialCollateralDeltaAmount = 200 * assetUnit(IERC20(ARBITRUM_USDC));

        increaseTokenBalance({
            _token: IERC20(ARBITRUM_USDC),
            _to: vaultProxyAddress,
            _amount: cancelledOrderInitialCollateralDeltaAmount
        });

        __createOrder(
            IGMXV2LeverageTradingPositionProd.CreateOrderActionArgs({
                addresses: IGMXV2LeverageTradingPositionProd.CreateOrderParamsAddresses({
                    market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
                    initialCollateralToken: ARBITRUM_USDC
                }),
                numbers: IGMXV2LeverageTradingPositionProd.CreateOrderParamsNumbers({
                    sizeDeltaUsd: 1_000 * GMX_ONE_USD_UNIT, // 1k USD,
                    initialCollateralDeltaAmount: cancelledOrderInitialCollateralDeltaAmount,
                    triggerPrice: 0,
                    acceptablePrice: type(uint256).max,
                    executionFee: executionFee,
                    minOutputAmount: 0,
                    validFromTime: 0
                }),
                orderType: IGMXV2OrderProd.OrderType.MarketIncrease,
                decreasePositionSwapType: IGMXV2OrderProd.DecreasePositionSwapType.NoSwap,
                isLong: true,
                autoCancel: false,
                exchangeRouter: address(exchangeRouter)
            })
        );

        skip(3600);

        __cancelOrder(
            IGMXV2LeverageTradingPositionProd.CancelOrderActionArgs({
                key: __getLastOrderKey(),
                exchangeRouter: address(exchangeRouter)
            })
        );

        // test sweep

        expectEmit(address(externalPosition));
        emit TrackedAssetsCleared();

        address[] memory trackedAssetsToAdd = toArray(ARBITRUM_WBTC, ARBITRUM_WETH);

        for (uint256 i; i < trackedAssetsToAdd.length; i++) {
            expectEmit(address(externalPosition));
            emit TrackedAssetAdded(trackedAssetsToAdd[i]);
        }

        uint256 preSweepVaultWETHBalance = IERC20(ARBITRUM_WETH).balanceOf(vaultProxyAddress);
        uint256 preSweepWBTCBalance = IERC20(ARBITRUM_WBTC).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __sweep();

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(ARBITRUM_WBTC, ARBITRUM_WETH, ARBITRUM_USDC)
        });

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) = externalPosition.getManagedAssets();

        // assert position managed assets

        for (uint256 i; i < managedAssets.length; i++) {
            if (managedAssets[i] == ARBITRUM_WBTC) {
                assertApproxEqRel(
                    managedAssetAmounts[i],
                    wbtcAssetIncrease - wbtcAssetDecrease,
                    WEI_ONE_PERCENT, // 1%
                    "Incorrect WBTC token EP balance post sweep"
                );
            }
            if (managedAssets[i] == ARBITRUM_WETH) {
                assertEq(
                    managedAssetAmounts[i],
                    pendingIncreaseOrderInitialCollateralDeltaAmount,
                    "Incorrect WETH token EP balance post sweep"
                );
            }
            if (managedAssets[i] == ARBITRUM_USDC) {
                assertEq(
                    managedAssetAmounts[i],
                    cancelledOrderInitialCollateralDeltaAmount,
                    "Incorrect USDC token EP balance post sweep"
                );
            }
        }

        assertEq(externalPosition.getTrackedAssets(), toArray(ARBITRUM_WBTC, ARBITRUM_WETH), "Incorrect tracked assets");

        // assert vault balances

        assertEq(
            IERC20(ARBITRUM_WBTC).balanceOf(vaultProxyAddress),
            preSweepWBTCBalance + wbtcAssetDecrease,
            "Incorrect WBTC token balance post sweep"
        );
        // cancel, already transferred all of the eth in the external position
        assertEq(
            IERC20(ARBITRUM_WETH).balanceOf(vaultProxyAddress),
            preSweepVaultWETHBalance,
            "Incorrect WETH token balance post sweep"
        );
        assertEq(
            cancelledOrderInitialCollateralDeltaAmount,
            IERC20(ARBITRUM_USDC).balanceOf(vaultProxyAddress),
            "Incorrect USDC token balance post sweep"
        );
    }

    // liquidation

    function test_afterOrderExecution_successAfterOrderExecutionIsCalledOnLiquidation() public {
        __test_afterOrderExecution_successAfterOrderExecutionIsCalledOnLiquidation({
            _market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
            _initialCollateralToken: ARBITRUM_USDC,
            _increaseInitialCollateralDeltaAmount: 100 * assetUnit(IERC20(ARBITRUM_USDC)),
            _increaseOrderSizeDeltaUsd: 400 * GMX_ONE_USD_UNIT, // 400 USD
            _liquidationHandler: ARBITRUM_GMXV2_LIQUIDATION_HANDLER
        });
    }

    // claim collateral

    function test_claimCollateral_success() public {
        __test_claimCollateral_success(
            ClaimCollateralSuccessArgs({
                market: ARBITRUM_GMXV2_MARKET_ETH_USD_WETH_USDC,
                initialCollateralLongToken: ARBITRUM_WETH,
                increaseInitialCollateralDeltaAmount: 1 * assetUnit(IERC20(ARBITRUM_WETH)),
                increaseOrderSizeDeltaUsd: 8_000 * GMX_ONE_USD_UNIT, // 8k USD
                userShortToken: ARBITRUM_USDC,
                userShortTokenDeltaAmount: 8_000_000 * assetUnit(IERC20(ARBITRUM_USDC)), // 8mln USD
                userShortTokenSizeDeltaUsd: 8_000_000 * GMX_ONE_USD_UNIT
            })
        );
    }

    // getManagedAssets

    function test_getManagedAssets_successValuationOfOpenPosition() public {
        __test_getManagedAssets_successValuationOfOpenPosition(ARBITRUM_GMXV2_MARKET_BTC_USD_WBTC_USDC);
    }
}

contract GMXV2LeverageTradingPositionArbitrumTest is GMXV2LeverageTradingPositionTestBaseArbitrum {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract GMXV2LeverageTradingPositionArbitrumTestV4 is GMXV2LeverageTradingPositionTestBaseArbitrum {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

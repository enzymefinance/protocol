// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAlicePosition as IAlicePositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/alice/AlicePositionLib.sol";
import {IUintListRegistry as IUintListRegistryProd} from "contracts/persistent/uint-list-registry/IUintListRegistry.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IAliceOrderManager} from "tests/interfaces/external/IAliceOrderManager.sol";
import {IAliceWhitelistManager} from "tests/interfaces/external/IAliceWhitelistManager.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {
    IAlicePositionLib,
    AlicePositionLibBase1 as AlicePositionLibBase1TypeLibrary
} from "tests/interfaces/internal/IAlicePositionLib.sol";
import {IAlicePositionParser} from "tests/interfaces/internal/IAlicePositionParser.sol";

// ETHEREUM MAINNET CONSTANTS
address constant ETHEREUM_ALICE_ORDER_MANAGER = 0x841473a19279E54a850E9083A3A57dE9e6244d2E;
uint16 constant ETHEREUM_ALICE_WBTC_USDC_INSTRUMENT_ID = 1;
uint16 constant ETHEREUM_ALICE_ETH_USDC_INSTRUMENT_ID = 2;

address constant ALICE_NATIVE_ASSET_ADDRESS = address(0);

abstract contract AliceTestBase is IntegrationTest {
    event OrderIdAdded(uint256 indexed orderId, AlicePositionLibBase1TypeLibrary.OrderDetails orderDetails);

    event OrderIdRemoved(uint256 indexed orderId);

    struct BuildAndPlaceOrderOutput {
        uint256 orderId;
        IERC20 outgoingAsset;
        IERC20 incomingAsset;
        uint256 orderQuantity;
        uint256 timestamp;
        uint256 limitAmountToGet;
    }

    uint256 internal aliceTypeId;
    uint16 internal instrumentId;
    address internal liquidityPoolContract;
    IAlicePositionLib internal aliceExternalPosition;
    IERC20 internal baseToken;
    IERC20 internal quoteToken;

    IAliceOrderManager internal aliceOrderManager;
    address internal aliceOwner;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal vaultProxyAddress;
    IExternalPositionManager internal externalPositionManager;

    function __initialize(address _aliceOrderManagerAddress, uint16 _instrumentId, uint256 _chainId) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        externalPositionManager = core.release.externalPositionManager;
        aliceTypeId = deployAlice({
            _aliceOrderManagerAddress: _aliceOrderManagerAddress,
            _wrappedNativeAssetAddress: address(wrappedNativeToken)
        });

        aliceOrderManager = IAliceOrderManager(_aliceOrderManagerAddress);
        aliceOwner = aliceOrderManager.aliceKey();
        liquidityPoolContract = aliceOrderManager.liquidityPoolContract();

        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        comptrollerProxyAddress = address(comptrollerProxy);
        vaultProxyAddress = address(vaultProxy);

        vm.prank(fundOwner);
        aliceExternalPosition = IAlicePositionLib(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
                _typeId: aliceTypeId,
                _initializationData: "",
                _callOnExternalPositionCallArgs: ""
            })
        );

        // Add the external position to Alice's whitelisted users
        IAliceWhitelistManager aliceWhitelistManager = IAliceWhitelistManager(aliceOrderManager.whitelistContract());
        vm.prank(aliceWhitelistManager.owner());
        aliceWhitelistManager.addAddress({_userAddress: address(aliceExternalPosition)});

        instrumentId = _instrumentId;
        IAliceOrderManager.Instrument memory instrument =
            aliceOrderManager.getInstrument({_instrumentId: instrumentId, _mustBeActive: false});

        baseToken = IERC20(instrument.base);
        quoteToken = IERC20(instrument.quote);

        // Increase the baseToken and quoteToken balances. Seed with weth if native asset is used.
        IERC20 parsedBaseToken = __parseAliceAsset({_rawAsset: baseToken});
        IERC20 parsedQuoteToken = __parseAliceAsset({_rawAsset: quoteToken});

        // Add the base and quote tokens to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(parsedBaseToken),
            _skipIfRegistered: true
        });
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(parsedQuoteToken),
            _skipIfRegistered: true
        });
        increaseTokenBalance({_token: parsedBaseToken, _to: vaultProxyAddress, _amount: assetUnit(parsedBaseToken) * 7});
        increaseTokenBalance({
            _token: parsedQuoteToken,
            _to: vaultProxyAddress,
            _amount: assetUnit(parsedQuoteToken) * 11
        });
    }

    // DEPLOYMENT HELPERS

    function deployAlice(address _aliceOrderManagerAddress, address _wrappedNativeAssetAddress)
        public
        returns (uint256 typeId_)
    {
        IAlicePositionLib alicePositionLib = deployAlicePositionLib({
            _aliceOrderManagerAddress: _aliceOrderManagerAddress,
            _wrappedNativeAssetAddress: _wrappedNativeAssetAddress
        });
        IAlicePositionParser alicePositionParser = deployAlicePositionParser({
            _aliceOrderManagerAddress: _aliceOrderManagerAddress,
            _wrappedNativeAssetAddress: _wrappedNativeAssetAddress
        });

        typeId_ = registerExternalPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _label: "ALICE",
            _lib: address(alicePositionLib),
            _parser: address(alicePositionParser)
        });

        return (typeId_);
    }

    function deployAlicePositionLib(address _aliceOrderManagerAddress, address _wrappedNativeAssetAddress)
        public
        returns (IAlicePositionLib)
    {
        bytes memory args = abi.encode(_aliceOrderManagerAddress, _wrappedNativeAssetAddress);
        address addr = deployCode("AlicePositionLib.sol", args);
        return IAlicePositionLib(addr);
    }

    function deployAlicePositionParser(address _aliceOrderManagerAddress, address _wrappedNativeAssetAddress)
        public
        returns (IAlicePositionParser)
    {
        bytes memory args = abi.encode(_aliceOrderManagerAddress, _wrappedNativeAssetAddress);
        address addr = deployCode("AlicePositionParser.sol", args);
        return IAlicePositionParser(addr);
    }

    // ACTION HELPERS

    function __placeOrder(IAlicePositionProd.PlaceOrderActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAlicePositionProd.Actions.PlaceOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __refundOrder(IAlicePositionProd.RefundOrderActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAlicePositionProd.Actions.RefundOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __sweep(IAlicePositionProd.SweepActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAlicePositionProd.Actions.Sweep),
            _actionArgs: abi.encode(_args)
        });
    }

    function __buildOrder(bool _isBuyOrder)
        private
        view
        returns (
            IAlicePositionProd.PlaceOrderActionArgs memory placeOrderArgs_,
            uint256 orderId_,
            IERC20 rawOutgoingAsset_,
            IERC20 rawIncomingAsset_,
            IERC20 outgoingAsset_,
            IERC20 incomingAsset_,
            uint256 orderQuantity_,
            uint256 limitAmountToGet_
        )
    {
        orderId_ = aliceOrderManager.getMostRecentOrderId() + 1;
        rawOutgoingAsset_ = _isBuyOrder ? quoteToken : baseToken;
        rawIncomingAsset_ = _isBuyOrder ? baseToken : quoteToken;
        outgoingAsset_ = __parseAliceAsset({_rawAsset: rawOutgoingAsset_});
        incomingAsset_ = __parseAliceAsset({_rawAsset: rawIncomingAsset_});

        orderQuantity_ = outgoingAsset_.balanceOf(vaultProxyAddress) / 3;
        limitAmountToGet_ = assetUnit({_asset: incomingAsset_}) * 7;

        placeOrderArgs_ = IAlicePositionProd.PlaceOrderActionArgs({
            instrumentId: instrumentId,
            isBuyOrder: _isBuyOrder,
            quantityToSell: orderQuantity_,
            limitAmountToGet: limitAmountToGet_
        });

        return (
            placeOrderArgs_,
            orderId_,
            rawOutgoingAsset_,
            rawIncomingAsset_,
            outgoingAsset_,
            incomingAsset_,
            orderQuantity_,
            limitAmountToGet_
        );
    }

    function __buildAndPlaceOrder(bool _isBuyOrder) private returns (BuildAndPlaceOrderOutput memory output_) {
        (
            IAlicePositionProd.PlaceOrderActionArgs memory placeOrderActionArgs,
            uint256 orderId,
            ,
            ,
            IERC20 outgoingAsset,
            IERC20 incomingAsset,
            uint256 orderQuantity,
            uint256 limitAmountToGet
        ) = __buildOrder({_isBuyOrder: _isBuyOrder});

        uint256 timestamp = block.timestamp;

        __placeOrder(placeOrderActionArgs);

        return (
            BuildAndPlaceOrderOutput({
                orderId: orderId,
                outgoingAsset: outgoingAsset,
                incomingAsset: incomingAsset,
                orderQuantity: orderQuantity,
                timestamp: timestamp,
                limitAmountToGet: limitAmountToGet
            })
        );
    }

    function __cancelOrder(uint256 _orderId, uint16 _instrumentId, uint256 _limitAmountToGet, uint256 _timestamp)
        private
    {
        AlicePositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});

        bool isBuyOrder = __isBuyOrder({_orderId: _orderId, _instrumentId: _instrumentId});

        vm.prank(aliceOwner);

        aliceOrderManager.cancelOrder({
            _orderId: _orderId,
            _user: address(aliceExternalPosition),
            _instrumentId: _instrumentId,
            _isBuyOrder: isBuyOrder,
            _quantityToSell: orderDetails.outgoingAmount,
            _limitAmountToGet: _limitAmountToGet,
            _timestamp: _timestamp
        });
    }

    function __isBuyOrder(uint256 _orderId, uint16 _instrumentId) private view returns (bool isBuyOrder_) {
        AlicePositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});
        IAliceOrderManager.Instrument memory instrumentDetails =
            aliceOrderManager.getInstrument({_instrumentId: _instrumentId, _mustBeActive: false});

        isBuyOrder_ = instrumentDetails.base == orderDetails.outgoingAssetAddress ? false : true;

        return isBuyOrder_;
    }

    function __parseAliceAsset(IERC20 _rawAsset) private view returns (IERC20 parsedAsset_) {
        return address(_rawAsset) == ALICE_NATIVE_ASSET_ADDRESS ? wrappedNativeToken : _rawAsset;
    }

    function __settleOrder(
        uint256 _orderId,
        uint16 _instrumentId,
        uint256 _limitAmountToGet,
        uint256 _timestamp,
        uint256 _settlementAmount
    ) private {
        AlicePositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});
        bool isBuyOrder = __isBuyOrder({_orderId: _orderId, _instrumentId: _instrumentId});

        // Seed the liquidity pool so that funds are available to trade
        IERC20 incomingAsset = __parseAliceAsset({_rawAsset: IERC20(orderDetails.incomingAssetAddress)});

        increaseTokenBalance({
            _token: incomingAsset,
            _to: liquidityPoolContract,
            _amount: assetUnit(incomingAsset) * 12345
        });

        vm.prank(aliceOwner);

        aliceOrderManager.settleOrder({
            _orderId: _orderId,
            _user: address(aliceExternalPosition),
            _instrumentId: _instrumentId,
            _isBuyOrder: isBuyOrder,
            _quantityToSell: orderDetails.outgoingAmount,
            _limitAmountToGet: _limitAmountToGet,
            _timestamp: _timestamp,
            _quantityReceivedPreFee: _settlementAmount
        });
    }

    // TESTS

    function __test_placeOrder(bool _isBuyOrder) private {
        (
            IAlicePositionProd.PlaceOrderActionArgs memory placeOrderActionArgs,
            uint256 orderId,
            IERC20 rawOutgoingAsset,
            IERC20 rawIncomingAsset,
            IERC20 outgoingAsset,
            ,
            uint256 orderQuantity,
        ) = __buildOrder({_isBuyOrder: _isBuyOrder});

        vm.recordLogs();

        expectEmit(address(aliceExternalPosition));
        emit OrderIdAdded(
            orderId,
            AlicePositionLibBase1TypeLibrary.OrderDetails(
                address(rawOutgoingAsset), address(rawIncomingAsset), orderQuantity
            )
        );

        uint256 preOrderVaultOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);

        __placeOrder({_args: placeOrderActionArgs});

        uint256 postOrderVaultOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        // The orderId should have been added to storage
        assertEq(toArray(orderId), aliceExternalPosition.getOrderIds(), "Incorrect orderIds");
        // The order details should have been added to storage
        AlicePositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: orderId});
        assertEq(orderDetails.outgoingAssetAddress, address(rawOutgoingAsset), "Incorrect outgoingAssetAddress");
        assertEq(orderDetails.incomingAssetAddress, address(rawIncomingAsset), "Incorrect incomingAssetAddress");
        assertEq(orderDetails.outgoingAmount, orderQuantity, "Incorrect outgoingAmount");

        // The vaultProxy should have been debited the quantityToSell
        assertEq(
            preOrderVaultOutgoingAssetBalance - postOrderVaultOutgoingAssetBalance,
            orderQuantity,
            "Incorrect vaultProxy blance"
        );

        // The EP should report the placedOrder in getManagedAssets
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            aliceExternalPosition.getManagedAssets();
        assertEq(managedAssets, toArray(address(outgoingAsset)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(orderQuantity), "Incorrect managedAssetAmounts");
    }

    function test_placeOrder_sellOrder_success() public {
        __test_placeOrder({_isBuyOrder: false});
    }

    function test_placeOrder_buyOrder_success() public {
        __test_placeOrder({_isBuyOrder: true});
    }

    function test_refundOrder_success() public {
        bool isBuyOrder = false;
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_isBuyOrder: isBuyOrder});

        uint256 preRefundVaultBalance = orderOutput.outgoingAsset.balanceOf(vaultProxyAddress);

        // Warp to the time where refunds are allowed
        skip(aliceOrderManager.refundTimeoutSeconds());

        vm.recordLogs();

        expectEmit(address(aliceExternalPosition));
        emit OrderIdRemoved(orderOutput.orderId);

        __refundOrder(
            IAlicePositionProd.RefundOrderActionArgs({
                orderId: orderOutput.orderId,
                instrumentId: instrumentId,
                isBuyOrder: isBuyOrder,
                quantityToSell: orderOutput.orderQuantity,
                limitAmountToGet: orderOutput.limitAmountToGet,
                timestamp: orderOutput.timestamp
            })
        );

        uint256 postRefundVaultBalance = orderOutput.outgoingAsset.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(orderOutput.outgoingAsset))
        });

        // The order should have been removed from storage
        assertEq(0, aliceExternalPosition.getOrderIds().length, "Incorrect orderIds length");
        assertEq(
            0,
            aliceExternalPosition.getOrderDetails({_orderId: orderOutput.orderId}).outgoingAmount,
            "Incorrect orderDetails"
        );

        // The vaultProxy should have been credited the orderQuantity
        assertEq(postRefundVaultBalance - preRefundVaultBalance, orderOutput.orderQuantity, "Incorrect refund amount");
    }

    function test_sweep_success() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_isBuyOrder: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _instrumentId: instrumentId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // The EP should report the reimbursed funds
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            aliceExternalPosition.getManagedAssets();
        assertEq(managedAssets, toArray(address(orderOutput.outgoingAsset)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(orderOutput.orderQuantity), "Incorrect managedAssetAmounts");

        uint256 preSweepVaultBalance = orderOutput.outgoingAsset.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        expectEmit(address(aliceExternalPosition));
        emit OrderIdRemoved(orderOutput.orderId);

        __sweep(IAlicePositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId)}));

        // The outgoing assets should be receivable (as the order was cancelled and the outgoing assets refunded)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(orderOutput.outgoingAsset))
        });

        uint256 postSweepVaultBalance = orderOutput.outgoingAsset.balanceOf(vaultProxyAddress);

        // The order should have been removed from storage
        assertEq(0, aliceExternalPosition.getOrderIds().length, "Incorrect orderIds length");
        assertEq(
            0,
            aliceExternalPosition.getOrderDetails({_orderId: orderOutput.orderId}).outgoingAmount,
            "Incorrect orderDetails"
        );

        // The vaultProxy should have been credited the orderQuantity
        assertEq(postSweepVaultBalance - preSweepVaultBalance, orderOutput.orderQuantity, "Incorrect sweep amount");
    }

    function test_settledOrderValuation_success() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_isBuyOrder: false});

        uint256 settlementAmount = orderOutput.limitAmountToGet * 3;

        // Settle the order so that the proceeds are available for sweeping
        __settleOrder({
            _orderId: orderOutput.orderId,
            _instrumentId: instrumentId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp,
            _settlementAmount: settlementAmount
        });

        uint256 preSweepIncomingAssetVaultBalance = orderOutput.incomingAsset.balanceOf(vaultProxyAddress);

        // Sweep the order
        __sweep(IAlicePositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId)}));
        uint256 postSweepIncomingAssetVaultBalance = orderOutput.incomingAsset.balanceOf(vaultProxyAddress);

        // The order should have been removed from storage
        assertEq(0, aliceExternalPosition.getOrderIds().length, "Incorrect orderIds length");
        assertEq(
            0,
            aliceExternalPosition.getOrderDetails({_orderId: orderOutput.orderId}).outgoingAmount,
            "Incorrect orderDetails"
        );

        uint256 feeRate = aliceOrderManager.feeRate();
        uint256 expectedIncomingAmount = settlementAmount - settlementAmount * feeRate / BPS_ONE_HUNDRED_PERCENT;

        // The vaultProxy should have been credited the orderQuantity
        assertEq(
            postSweepIncomingAssetVaultBalance - preSweepIncomingAssetVaultBalance,
            expectedIncomingAmount,
            "Incorrect sweep amount"
        );
    }

    function test_multiplePositionsValuation_success() public {
        // Order #1 - Place a buy order
        BuildAndPlaceOrderOutput memory firstOrderOutput = __buildAndPlaceOrder({_isBuyOrder: true});

        // Order #2 - Place a sell order
        BuildAndPlaceOrderOutput memory secondOrderOutput = __buildAndPlaceOrder({_isBuyOrder: false});

        // Order #3 - Place an order with a different instrument
        uint16 otherInstrumentId = instrumentId + 1;
        IAliceOrderManager.Instrument memory otherInstrument =
            aliceOrderManager.getInstrument({_instrumentId: otherInstrumentId, _mustBeActive: false});

        uint256 thirdOrderId = aliceOrderManager.getMostRecentOrderId() + 1;
        IERC20 thirdOutgoingAsset = __parseAliceAsset({_rawAsset: IERC20(otherInstrument.base)});
        IERC20 thirdIncomingAsset = __parseAliceAsset({_rawAsset: IERC20(otherInstrument.quote)});

        // Add the outgoing and incoming tokens to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(thirdOutgoingAsset),
            _skipIfRegistered: true
        });
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(thirdIncomingAsset),
            _skipIfRegistered: true
        });
        increaseTokenBalance({
            _token: thirdOutgoingAsset,
            _to: vaultProxyAddress,
            _amount: assetUnit(thirdOutgoingAsset) * 7
        });
        increaseTokenBalance({
            _token: thirdIncomingAsset,
            _to: vaultProxyAddress,
            _amount: assetUnit(thirdOutgoingAsset) * 11
        });

        uint256 thirdOrderQuantity = thirdOutgoingAsset.balanceOf(vaultProxyAddress) / 3;
        uint256 thirdOrderLimitAmountToGet = assetUnit({_asset: thirdIncomingAsset}) * 7;
        uint256 thirdOrderTimestamp = block.timestamp;

        __placeOrder({
            _args: IAlicePositionProd.PlaceOrderActionArgs({
                instrumentId: otherInstrumentId,
                isBuyOrder: false,
                quantityToSell: thirdOrderQuantity,
                limitAmountToGet: thirdOrderLimitAmountToGet
            })
        });

        // Orders should be valued according to the value of the outgoing assets
        {
            {
                (address[] memory pendingOrdersManagedAssets, uint256[] memory pendingOrdersManagedAssetAmounts) =
                    aliceExternalPosition.getManagedAssets();
                assertEq(
                    pendingOrdersManagedAssets,
                    toArray(
                        address(firstOrderOutput.outgoingAsset),
                        address(secondOrderOutput.outgoingAsset),
                        address(thirdOutgoingAsset)
                    ),
                    "Incorrect managedAssets"
                );
                assertEq(
                    pendingOrdersManagedAssetAmounts,
                    toArray(firstOrderOutput.orderQuantity, secondOrderOutput.orderQuantity, thirdOrderQuantity),
                    "Incorrect managedAssetAmounts"
                );
            }
        }

        // Settle order #1, leave order #2 unchanged, and cancel order #3
        uint256 firstOrderNetIncomingAmount;
        {
            uint256 firstOrderSettlementAmount = firstOrderOutput.limitAmountToGet * 3;
            // Settle order #1
            __settleOrder({
                _orderId: firstOrderOutput.orderId,
                _instrumentId: instrumentId,
                _limitAmountToGet: firstOrderOutput.limitAmountToGet,
                _timestamp: firstOrderOutput.timestamp,
                _settlementAmount: firstOrderSettlementAmount
            });

            // Cancel order #3
            __cancelOrder({
                _orderId: thirdOrderId,
                _instrumentId: otherInstrumentId,
                _limitAmountToGet: thirdOrderLimitAmountToGet,
                _timestamp: thirdOrderTimestamp
            });

            firstOrderNetIncomingAmount = firstOrderSettlementAmount
                - firstOrderSettlementAmount * aliceOrderManager.feeRate() / BPS_ONE_HUNDRED_PERCENT;
        }

        // Orders should be properly valued
        // Order #1 is now valued according to the settled amount in the incoming asset
        // Order #2 is still valued according to the value of the outgoing asset (same as order #1 incomingAsset)
        // Order #3 is now valued at the cancelled amount
        {
            (address[] memory settledOrdersManagedAssets, uint256[] memory settledOrdersManagedAssetAmounts) =
                aliceExternalPosition.getManagedAssets();
            assertEq(
                settledOrdersManagedAssets,
                toArray(address(firstOrderOutput.incomingAsset), address(thirdOutgoingAsset)),
                "Incorrect managedAssets"
            );
            assertEq(
                settledOrdersManagedAssetAmounts,
                toArray(firstOrderNetIncomingAmount + secondOrderOutput.orderQuantity, thirdOrderQuantity),
                "Incorrect managedAssetAmounts"
            );
        }
    }
}

contract AliceWbtcUsdcTestEthereum is AliceTestBase {
    function setUp() public override {
        __initialize({
            _aliceOrderManagerAddress: ETHEREUM_ALICE_ORDER_MANAGER,
            _instrumentId: ETHEREUM_ALICE_WBTC_USDC_INSTRUMENT_ID,
            _chainId: ETHEREUM_CHAIN_ID
        });
    }
}

// The ETH_USDC instrumentID tests native asset handling
contract AliceEthUsdcTestEthereum is AliceTestBase {
    function setUp() public override {
        __initialize({
            _aliceOrderManagerAddress: ETHEREUM_ALICE_ORDER_MANAGER,
            _instrumentId: ETHEREUM_ALICE_ETH_USDC_INSTRUMENT_ID,
            _chainId: ETHEREUM_CHAIN_ID
        });
    }
}

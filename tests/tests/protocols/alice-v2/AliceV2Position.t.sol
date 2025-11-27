// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {
    IAliceV2Position as IAliceV2PositionProd
} from "contracts/release/extensions/external-position-manager/external-positions/alice-v2/AliceV2PositionLib.sol";
import {
    IUintListRegistry as IUintListRegistryProd
} from "contracts/persistent/uint-list-registry/IUintListRegistry.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IAliceInstantOrderV2} from "tests/interfaces/external/IAliceInstantOrderV2.sol";
import {IAliceWhitelistManager} from "tests/interfaces/external/IAliceWhitelistManager.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {
    IAliceV2PositionLib,
    AliceV2PositionLibBase1 as AliceV2PositionLibBase1TypeLibrary
} from "tests/interfaces/internal/IAliceV2PositionLib.sol";
import {IAliceV2PositionParser} from "tests/interfaces/internal/IAliceV2PositionParser.sol";

address constant ETHEREUM_ALICE_ORDER_MANAGER = 0x6F13230851B7e00e3e79277DccE6953140D8302D;
address constant ALICE_NATIVE_ASSET_ADDRESS = address(0);

abstract contract AliceTestBase is IntegrationTest {
    event OrderIdAdded(uint256 indexed orderId, AliceV2PositionLibBase1TypeLibrary.OrderDetails orderDetails);

    event OrderIdRemoved(uint256 indexed orderId);

    struct BuildAndPlaceOrderOutput {
        uint256 orderId;
        IERC20 rawOutgoingAsset;
        IERC20 rawIncomingAsset;
        IERC20 outgoingAsset;
        IERC20 incomingAsset;
        uint256 orderQuantity;
        uint256 timestamp;
        uint256 limitAmountToGet;
    }

    uint256 internal aliceTypeId;
    address internal liquidityPoolContract;
    IAliceV2PositionLib internal aliceExternalPosition;
    IERC20 internal sellToken;
    IERC20 internal buyToken;
    IERC20 internal secondarySellToken;
    IERC20 internal secondaryBuyToken;

    IAliceInstantOrderV2 internal aliceOrderManager;
    address internal aliceOwner;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal vaultProxyAddress;
    IExternalPositionManager internal externalPositionManager;

    function __initialize(
        address _aliceOrderManagerAddress,
        address _sellToken,
        address _buyToken,
        address _secondarySellToken,
        address _secondaryBuyToken,
        uint256 _chainId,
        uint256 _forkBlock
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId, _forkBlock: _forkBlock});

        externalPositionManager = core.release.externalPositionManager;
        aliceTypeId = deployAlice({
            _aliceOrderManagerAddress: _aliceOrderManagerAddress,
            _wrappedNativeAssetAddress: address(wrappedNativeToken)
        });

        aliceOrderManager = IAliceInstantOrderV2(_aliceOrderManagerAddress);
        aliceOwner = aliceOrderManager.aliceKey();

        liquidityPoolContract = aliceOrderManager.liquidityPoolContract();

        IComptrollerLib comptrollerProxy;
        IVaultLib vaultProxy;
        (comptrollerProxy, vaultProxy, fundOwner) = createFundMinimal({_fundDeployer: core.release.fundDeployer});
        comptrollerProxyAddress = address(comptrollerProxy);
        vaultProxyAddress = address(vaultProxy);

        vm.prank(fundOwner);
        aliceExternalPosition = IAliceV2PositionLib(
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

        sellToken = IERC20(_sellToken);
        buyToken = IERC20(_buyToken);
        secondarySellToken = IERC20(_secondarySellToken);
        secondaryBuyToken = IERC20(_secondaryBuyToken);

        // Increase the sellToken and buyToken balances. Seed with weth if native asset is used.
        IERC20 parsedSellToken = __parseAliceAsset({_rawAsset: sellToken});
        IERC20 parsedBuyToken = __parseAliceAsset({_rawAsset: buyToken});

        // Add the base and quote tokens to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(parsedSellToken),
            _skipIfRegistered: true
        });
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(parsedBuyToken),
            _skipIfRegistered: true
        });

        increaseTokenBalance({_token: parsedSellToken, _to: vaultProxyAddress, _amount: assetUnit(parsedSellToken) * 7});
        increaseTokenBalance({_token: parsedBuyToken, _to: vaultProxyAddress, _amount: assetUnit(parsedBuyToken) * 11});
    }

    // DEPLOYMENT HELPERS

    function deployAlice(address _aliceOrderManagerAddress, address _wrappedNativeAssetAddress)
        public
        returns (uint256 typeId_)
    {
        IAliceV2PositionLib alicePositionLib = deployAlicePositionLib({
            _aliceOrderManagerAddress: _aliceOrderManagerAddress, _wrappedNativeAssetAddress: _wrappedNativeAssetAddress
        });
        IAliceV2PositionParser alicePositionParser = deployAlicePositionParser({
            _aliceOrderManagerAddress: _aliceOrderManagerAddress, _wrappedNativeAssetAddress: _wrappedNativeAssetAddress
        });

        typeId_ = registerExternalPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _label: "ALICE_V2",
            _lib: address(alicePositionLib),
            _parser: address(alicePositionParser)
        });

        return (typeId_);
    }

    function deployAlicePositionLib(address _aliceOrderManagerAddress, address _wrappedNativeAssetAddress)
        public
        returns (IAliceV2PositionLib)
    {
        bytes memory args = abi.encode(_aliceOrderManagerAddress, _wrappedNativeAssetAddress);
        address addr = deployCode("AliceV2PositionLib.sol", args);
        return IAliceV2PositionLib(addr);
    }

    function deployAlicePositionParser(address _aliceOrderManagerAddress, address _wrappedNativeAssetAddress)
        public
        returns (IAliceV2PositionParser)
    {
        bytes memory args = abi.encode(_aliceOrderManagerAddress, _wrappedNativeAssetAddress);
        address addr = deployCode("AliceV2PositionParser.sol", args);
        return IAliceV2PositionParser(addr);
    }

    // ACTION HELPERS

    function __placeOrder(IAliceV2PositionProd.PlaceOrderActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAliceV2PositionProd.Actions.PlaceOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __placeOrderWithRefId(IAliceV2PositionProd.PlaceOrderActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAliceV2PositionProd.Actions.PlaceOrderWithRefId),
            _actionArgs: abi.encode(_args)
        });
    }

    function __refundOrder(IAliceV2PositionProd.RefundOrderActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAliceV2PositionProd.Actions.RefundOrder),
            _actionArgs: abi.encode(_args)
        });
    }

    function __sweep(IAliceV2PositionProd.SweepActionArgs memory _args) private {
        vm.prank(fundOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: IComptrollerLib(comptrollerProxyAddress),
            _externalPositionAddress: address(aliceExternalPosition),
            _actionId: uint256(IAliceV2PositionProd.Actions.Sweep),
            _actionArgs: abi.encode(_args)
        });
    }

    function __buildOrder(bool _inverse)
        private
        view
        returns (
            IAliceV2PositionProd.PlaceOrderActionArgs memory placeOrderArgs_,
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
        rawOutgoingAsset_ = _inverse ? buyToken : sellToken;
        rawIncomingAsset_ = _inverse ? sellToken : buyToken;
        outgoingAsset_ = __parseAliceAsset({_rawAsset: rawOutgoingAsset_});
        incomingAsset_ = __parseAliceAsset({_rawAsset: rawIncomingAsset_});

        orderQuantity_ = outgoingAsset_.balanceOf(vaultProxyAddress) / 3;
        limitAmountToGet_ = assetUnit({_asset: incomingAsset_}) * 7;

        placeOrderArgs_ = IAliceV2PositionProd.PlaceOrderActionArgs({
            tokenToSell: address(rawOutgoingAsset_),
            tokenToBuy: address(rawIncomingAsset_),
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

    function __buildAndPlaceOrder(bool _inverse) private returns (BuildAndPlaceOrderOutput memory output_) {
        (
            IAliceV2PositionProd.PlaceOrderActionArgs memory placeOrderActionArgs,
            uint256 orderId,
            IERC20 rawOutgoingAsset,
            IERC20 rawIncomingAsset,
            IERC20 outgoingAsset,
            IERC20 incomingAsset,
            uint256 orderQuantity,
            uint256 limitAmountToGet
        ) = __buildOrder({_inverse: _inverse});

        uint256 timestamp = block.timestamp;

        __placeOrder(placeOrderActionArgs);

        return (BuildAndPlaceOrderOutput({
                orderId: orderId,
                rawOutgoingAsset: rawOutgoingAsset,
                rawIncomingAsset: rawIncomingAsset,
                outgoingAsset: outgoingAsset,
                incomingAsset: incomingAsset,
                orderQuantity: orderQuantity,
                timestamp: timestamp,
                limitAmountToGet: limitAmountToGet
            }));
    }

    function __buildAndPlaceOrderWithRefId(bool _inverse) private returns (BuildAndPlaceOrderOutput memory output_) {
        (
            IAliceV2PositionProd.PlaceOrderActionArgs memory placeOrderActionArgs,
            uint256 orderId,
            IERC20 rawOutgoingAsset,
            IERC20 rawIncomingAsset,
            IERC20 outgoingAsset,
            IERC20 incomingAsset,
            uint256 orderQuantity,
            uint256 limitAmountToGet
        ) = __buildOrder({_inverse: _inverse});

        uint256 timestamp = block.timestamp;

        __placeOrderWithRefId(placeOrderActionArgs);

        return (BuildAndPlaceOrderOutput({
                orderId: orderId,
                rawOutgoingAsset: rawOutgoingAsset,
                rawIncomingAsset: rawIncomingAsset,
                outgoingAsset: outgoingAsset,
                incomingAsset: incomingAsset,
                orderQuantity: orderQuantity,
                timestamp: timestamp,
                limitAmountToGet: limitAmountToGet
            }));
    }

    function __cancelOrder(uint256 _orderId, uint256 _limitAmountToGet, uint256 _timestamp) private {
        AliceV2PositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});

        vm.prank(aliceOwner);

        aliceOrderManager.cancelOrder({
            _orderId: _orderId,
            _user: address(aliceExternalPosition),
            _tokenToSell: address(orderDetails.outgoingAssetAddress),
            _tokenToBuy: address(orderDetails.incomingAssetAddress),
            _quantityToSell: orderDetails.outgoingAmount,
            _limitAmountToGet: _limitAmountToGet,
            _timestamp: _timestamp
        });
    }

    function __cancelOrderWithReference(uint256 _orderId, uint256 _limitAmountToGet, uint256 _timestamp) private {
        AliceV2PositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});

        vm.prank(aliceOwner);

        aliceOrderManager.cancelOrderWithReference({
            _orderId: _orderId,
            _user: address(aliceExternalPosition),
            _tokenToSell: address(orderDetails.outgoingAssetAddress),
            _tokenToBuy: address(orderDetails.incomingAssetAddress),
            _quantityToSell: orderDetails.outgoingAmount,
            _limitAmountToGet: _limitAmountToGet,
            _timestamp: _timestamp,
            _receiver: address(aliceExternalPosition),
            _refId: bytes32(_orderId)
        });
    }

    function __parseAliceAsset(IERC20 _rawAsset) private view returns (IERC20 parsedAsset_) {
        return address(_rawAsset) == ALICE_NATIVE_ASSET_ADDRESS ? wrappedNativeToken : _rawAsset;
    }

    function __settleOrder(uint256 _orderId, uint256 _limitAmountToGet, uint256 _timestamp, uint256 _settlementAmount)
        private
    {
        AliceV2PositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});

        // Seed the liquidity pool so that funds are available to trade
        IERC20 incomingAsset = __parseAliceAsset({_rawAsset: IERC20(orderDetails.incomingAssetAddress)});

        increaseTokenBalance({
            _token: incomingAsset, _to: liquidityPoolContract, _amount: assetUnit(incomingAsset) * 12345
        });

        vm.prank(aliceOwner);

        aliceOrderManager.settleOrder({
            _orderId: _orderId,
            _user: address(aliceExternalPosition),
            _tokenToSell: address(orderDetails.outgoingAssetAddress),
            _tokenToBuy: address(orderDetails.incomingAssetAddress),
            _quantityToSell: orderDetails.outgoingAmount,
            _limitAmountToGet: _limitAmountToGet,
            _timestamp: _timestamp,
            _quantityReceivedPreFee: _settlementAmount
        });
    }

    function __settleOrderWithReference(
        uint256 _orderId,
        uint256 _limitAmountToGet,
        uint256 _timestamp,
        uint256 _settlementAmount
    ) private {
        AliceV2PositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: _orderId});

        {
            // Seed the liquidity pool so that funds are available to trade
            IERC20 incomingAsset = __parseAliceAsset({_rawAsset: IERC20(orderDetails.incomingAssetAddress)});

            increaseTokenBalance({
                _token: incomingAsset, _to: liquidityPoolContract, _amount: assetUnit(incomingAsset) * 12345
            });
        }

        vm.prank(aliceOwner);

        {
            aliceOrderManager.settleOrderWithReference({
                _orderId: _orderId,
                _user: address(aliceExternalPosition),
                _tokenToSell: address(orderDetails.outgoingAssetAddress),
                _tokenToBuy: address(orderDetails.incomingAssetAddress),
                _quantityToSell: orderDetails.outgoingAmount,
                _limitAmountToGet: _limitAmountToGet,
                _timestamp: _timestamp,
                _quantityReceivedPreFee: _settlementAmount,
                _receiver: address(aliceExternalPosition),
                _refId: bytes32(_orderId)
            });
        }
    }

    // TESTS

    function __test_placeOrder(bool _inverse) private {
        (
            IAliceV2PositionProd.PlaceOrderActionArgs memory placeOrderActionArgs,
            uint256 orderId,
            IERC20 rawOutgoingAsset,
            IERC20 rawIncomingAsset,
            IERC20 outgoingAsset,,
            uint256 orderQuantity,
        ) = __buildOrder({_inverse: _inverse});

        vm.recordLogs();

        expectEmit(address(aliceExternalPosition));
        emit OrderIdAdded(
            orderId,
            AliceV2PositionLibBase1TypeLibrary.OrderDetails(
                address(rawOutgoingAsset), address(rawIncomingAsset), orderQuantity
            )
        );

        uint256 preOrderVaultOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);

        __placeOrder({_args: placeOrderActionArgs});

        uint256 postOrderVaultOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(), _externalPositionManager: externalPositionManager, _assets: new address[](0)
        });

        // The orderId should have been added to storage
        assertEq(toArray(orderId), aliceExternalPosition.getOrderIds(), "Incorrect orderIds");
        // The order details should have been added to storage
        AliceV2PositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: orderId});
        assertEq(orderDetails.outgoingAssetAddress, address(rawOutgoingAsset), "Incorrect outgoingAssetAddress");
        assertEq(orderDetails.incomingAssetAddress, address(rawIncomingAsset), "Incorrect incomingAssetAddress");
        assertEq(orderDetails.outgoingAmount, orderQuantity, "Incorrect outgoingAmount");

        // The vaultProxy should have been debited the quantityToSell
        assertEq(
            preOrderVaultOutgoingAssetBalance - postOrderVaultOutgoingAssetBalance,
            orderQuantity,
            "Incorrect vaultProxy balance"
        );

        // The EP should report the placedOrder in getManagedAssets
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            aliceExternalPosition.getManagedAssets();
        assertEq(managedAssets, toArray(address(outgoingAsset)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(orderQuantity), "Incorrect managedAssetAmounts");
    }

    function __test_placeOrderWithRefId(bool _inverse, bool _settled) private {
        (
            IAliceV2PositionProd.PlaceOrderActionArgs memory placeOrderActionArgs,
            uint256 orderId,
            IERC20 rawOutgoingAsset,
            IERC20 rawIncomingAsset,
            IERC20 outgoingAsset,
            IERC20 incomingAsset,
            uint256 orderQuantity,
            uint256 limitAmountToGet
        ) = __buildOrder({_inverse: _inverse});

        vm.recordLogs();

        expectEmit(address(aliceExternalPosition));
        emit OrderIdAdded(
            orderId,
            AliceV2PositionLibBase1TypeLibrary.OrderDetails(
                address(rawOutgoingAsset), address(rawIncomingAsset), orderQuantity
            )
        );

        uint256 preOrderVaultOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);

        uint256 timestamp = block.timestamp;

        __placeOrderWithRefId({_args: placeOrderActionArgs});

        uint256 postOrderVaultOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(incomingAsset), address(outgoingAsset))
        });

        // The orderId should have been added to storage
        assertEq(toArray(orderId), aliceExternalPosition.getOrderIds(), "Incorrect orderIds");
        // The reference ID should have been added to storage
        assertTrue(aliceExternalPosition.isPendingReferenceId(bytes32(orderId)), "Incorrect reference ID");

        // The order details should have been added to storage
        AliceV2PositionLibBase1TypeLibrary.OrderDetails memory orderDetails =
            aliceExternalPosition.getOrderDetails({_orderId: orderId});
        assertEq(orderDetails.outgoingAssetAddress, address(rawOutgoingAsset), "Incorrect outgoingAssetAddress");
        assertEq(orderDetails.incomingAssetAddress, address(rawIncomingAsset), "Incorrect incomingAssetAddress");
        assertEq(orderDetails.outgoingAmount, orderQuantity, "Incorrect outgoingAmount");

        // The vaultProxy should have been debited the quantityToSell
        assertEq(
            preOrderVaultOutgoingAssetBalance - postOrderVaultOutgoingAssetBalance,
            orderQuantity,
            "Incorrect vaultProxy balance"
        );

        // The EP should report the placedOrder in getManagedAssets
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            aliceExternalPosition.getManagedAssets();
        assertEq(managedAssets, toArray(address(outgoingAsset)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(orderQuantity), "Incorrect managedAssetAmounts");

        if (_settled) {
            uint256 settlementAmount = limitAmountToGet * 3;
            uint256 incomingAssetBalancePre = incomingAsset.balanceOf(vaultProxyAddress);

            __settleOrderWithReference({
                _orderId: orderId,
                _limitAmountToGet: limitAmountToGet,
                _timestamp: timestamp,
                _settlementAmount: settlementAmount
            });

            uint256 expectedIncomingAmount = settlementAmount - settlementAmount
                * aliceOrderManager.feeRate({_user: address(aliceExternalPosition)}) / BPS_ONE_HUNDRED_PERCENT;

            // Assert that the orderId has been removed and some incoming asset is back into the vault
            assertEq(0, aliceExternalPosition.getOrderIds().length, "Incorrect orderIds length");
            assertGe(
                incomingAsset.balanceOf(vaultProxyAddress) - incomingAssetBalancePre,
                expectedIncomingAmount,
                "Incorrect incomingAsset balance"
            );
        } else {
            uint256 outgoingAssetBalancePre = outgoingAsset.balanceOf(vaultProxyAddress);

            __cancelOrderWithReference({_orderId: orderId, _limitAmountToGet: limitAmountToGet, _timestamp: timestamp});

            // Assert that the orderId has been removed and outgoing asset is back into the vault
            assertEq(0, aliceExternalPosition.getOrderIds().length, "Incorrect orderIds length");
            assertEq(
                outgoingAsset.balanceOf(vaultProxyAddress),
                outgoingAssetBalancePre + orderQuantity,
                "Incorrect incomingAsset balance"
            );
        }
    }

    function test_placeOrder_sellOrder_success() public {
        __test_placeOrder({_inverse: false});
    }

    function test_placeOrder_buyOrder_success() public {
        __test_placeOrder({_inverse: true});
    }

    function test_placeOrderWithRefId_settled_sellOrder_success() public {
        __test_placeOrderWithRefId({_inverse: false, _settled: true});
    }

    function test_placeOrderWithRefId_cancelled_sellOrder_success() public {
        __test_placeOrderWithRefId({_inverse: false, _settled: false});
    }

    function test_placeOrderWithRefId_settled_buyOrder_success() public {
        __test_placeOrderWithRefId({_inverse: true, _settled: true});
    }

    function test_placeOrderWithRefId_cancelled_buyOrder_success() public {
        __test_placeOrderWithRefId({_inverse: true, _settled: false});
    }

    function test_refundOrder_success() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        uint256 preRefundVaultBalance = orderOutput.outgoingAsset.balanceOf(vaultProxyAddress);

        // Warp to the time where refunds are allowed
        skip(aliceOrderManager.refundTimeoutSeconds());

        vm.recordLogs();

        expectEmit(address(aliceExternalPosition));
        emit OrderIdRemoved(orderOutput.orderId);

        __refundOrder(
            IAliceV2PositionProd.RefundOrderActionArgs({
                orderId: orderOutput.orderId,
                tokenToSell: address(orderOutput.rawOutgoingAsset),
                tokenToBuy: address(orderOutput.rawIncomingAsset),
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

    function test_sweep_failsIfOrderIsNotSettledOrCancelled() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        vm.expectRevert(IAliceV2PositionLib.OrderNotSettledOrCancelled.selector);

        // Attempt to sweep order that has not been settled or cancelled
        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId)}));
    }

    function test_sweep_success() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
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

        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId)}));

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
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        uint256 settlementAmount = orderOutput.limitAmountToGet * 3;

        // Settle the order so that the proceeds are available for sweeping
        __settleOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp,
            _settlementAmount: settlementAmount
        });

        uint256 preSweepIncomingAssetVaultBalance = orderOutput.incomingAsset.balanceOf(vaultProxyAddress);

        // Sweep the order
        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId)}));
        uint256 postSweepIncomingAssetVaultBalance = orderOutput.incomingAsset.balanceOf(vaultProxyAddress);

        // The order should have been removed from storage
        assertEq(0, aliceExternalPosition.getOrderIds().length, "Incorrect orderIds length");
        assertEq(
            0,
            aliceExternalPosition.getOrderDetails({_orderId: orderOutput.orderId}).outgoingAmount,
            "Incorrect orderDetails"
        );

        uint256 feeRate = aliceOrderManager.feeRate({_user: address(aliceExternalPosition)});
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
        BuildAndPlaceOrderOutput memory firstOrderOutput = __buildAndPlaceOrder({_inverse: true});

        // Order #2 - Place a sell order
        BuildAndPlaceOrderOutput memory secondOrderOutput = __buildAndPlaceOrder({_inverse: false});

        // Order #3 - Place an order with a different token
        uint256 thirdOrderId = aliceOrderManager.getMostRecentOrderId() + 1;
        IERC20 thirdOutgoingAsset = __parseAliceAsset({_rawAsset: secondarySellToken});
        IERC20 thirdIncomingAsset = __parseAliceAsset({_rawAsset: secondaryBuyToken});

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
            _token: thirdOutgoingAsset, _to: vaultProxyAddress, _amount: assetUnit(thirdOutgoingAsset) * 7
        });
        increaseTokenBalance({
            _token: thirdIncomingAsset, _to: vaultProxyAddress, _amount: assetUnit(thirdOutgoingAsset) * 11
        });

        uint256 thirdOrderQuantity = thirdOutgoingAsset.balanceOf(vaultProxyAddress) / 3;
        uint256 thirdOrderLimitAmountToGet = assetUnit({_asset: thirdIncomingAsset}) * 7;
        uint256 thirdOrderTimestamp = block.timestamp;

        __placeOrder({
            _args: IAliceV2PositionProd.PlaceOrderActionArgs({
                tokenToSell: address(thirdOutgoingAsset),
                tokenToBuy: address(thirdIncomingAsset),
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
                _limitAmountToGet: firstOrderOutput.limitAmountToGet,
                _timestamp: firstOrderOutput.timestamp,
                _settlementAmount: firstOrderSettlementAmount
            });

            // Cancel order #3
            __cancelOrder({
                _orderId: thirdOrderId, _limitAmountToGet: thirdOrderLimitAmountToGet, _timestamp: thirdOrderTimestamp
            });

            firstOrderNetIncomingAmount = firstOrderSettlementAmount - firstOrderSettlementAmount
                * aliceOrderManager.feeRate({_user: address(aliceExternalPosition)}) / BPS_ONE_HUNDRED_PERCENT;
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

    //////////////////////
    // FAILURE TESTS //
    //////////////////////

    function test_notifySettle_failsWithIncorrectSender() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Settle the order first
        __settleOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp,
            _settlementAmount: orderOutput.limitAmountToGet * 2
        });

        // Attempt to call notifySettle from an incorrect sender (not Alice Order Manager)
        vm.expectRevert(IAliceV2PositionLib.InvalidSender.selector);
        vm.prank(makeAddr("incorrectSender"));
        aliceExternalPosition.notifySettle(
            address(orderOutput.incomingAsset), orderOutput.limitAmountToGet, bytes32(orderOutput.orderId)
        );
    }

    function test_notifySettle_failsWithNotSettledOrCancelledOrder() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrderWithRefId({_inverse: false});

        // Attempt to call notifySettle on an order that hasn't been settled or cancelled
        vm.expectRevert(IAliceV2PositionLib.OrderNotSettledOrCancelled.selector);
        vm.prank(address(aliceOrderManager));
        aliceExternalPosition.notifySettle(
            address(orderOutput.incomingAsset), orderOutput.limitAmountToGet, bytes32(orderOutput.orderId)
        );
    }

    function test_notifyCancel_failsWithIncorrectSender() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order first
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to call notifyCancel from an incorrect sender (not Alice Order Manager)
        vm.expectRevert(IAliceV2PositionLib.InvalidSender.selector);
        vm.prank(makeAddr("incorrectSender"));
        aliceExternalPosition.notifyCancel({_referenceId: bytes32(orderOutput.orderId)});
    }

    function test_notifyCancel_failsWithNotSettledOrCancelledOrder() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrderWithRefId({_inverse: false});

        // Attempt to call notifyCancel on an order that hasn't been settled or cancelled
        vm.expectRevert(IAliceV2PositionLib.OrderNotSettledOrCancelled.selector);
        vm.prank(address(aliceOrderManager));
        aliceExternalPosition.notifyCancel({_referenceId: bytes32(orderOutput.orderId)});
    }

    function test_sweep_failsWithDuplicateOrderIds() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to sweep with duplicate order IDs
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionParser.DuplicateOrderId.selector));
        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId, orderOutput.orderId)}));
    }

    function test_sweep_failsWithUnknownOrderId() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to sweep with an unknown order ID
        uint256 unknownOrderId = 999999;
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionParser.UnknownOrderId.selector));
        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(unknownOrderId)}));
    }

    function test_sweep_failsWithMixedValidAndUnknownOrderIds() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to sweep with a mix of valid and unknown order IDs
        uint256 unknownOrderId = 999999;
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionParser.UnknownOrderId.selector));
        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId, unknownOrderId)}));
    }

    function test_parseAssetsForAction_failsWithDuplicateOrderIds() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to parse assets with duplicate order IDs
        address parserAddress = externalPositionManager.getExternalPositionParserForType(aliceTypeId);
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionParser.DuplicateOrderId.selector));
        IAliceV2PositionParser(parserAddress)
            .parseAssetsForAction(
                address(aliceExternalPosition),
                uint256(IAliceV2PositionProd.Actions.Sweep),
                abi.encode(
                    IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderOutput.orderId, orderOutput.orderId)})
                )
            );
    }

    function test_parseAssetsForAction_failsWithUnknownOrderId() public {
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        // Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to parse assets with an unknown order ID
        uint256 unknownOrderId = 999999;
        address parserAddress = externalPositionManager.getExternalPositionParserForType(aliceTypeId);
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionParser.UnknownOrderId.selector));
        IAliceV2PositionParser(parserAddress)
            .parseAssetsForAction(
                address(aliceExternalPosition),
                uint256(IAliceV2PositionProd.Actions.Sweep),
                abi.encode(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(unknownOrderId)}))
            );
    }

    function test_notifySettle_failsWithInvalidReferenceId() public {
        // Create a regular order (no reference id)
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        __settleOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp,
            _settlementAmount: orderOutput.limitAmountToGet * 2
        });

        // Attempt to call notifySettle
        vm.expectRevert(IAliceV2PositionLib.InvalidReferenceId.selector);
        vm.prank(address(aliceOrderManager));
        aliceExternalPosition.notifySettle(
            address(orderOutput.incomingAsset), orderOutput.limitAmountToGet, bytes32(orderOutput.orderId)
        );
    }

    function test_notifyCancel_failsWithInvalidReferenceId() public {
        // Create a regular order (no reference id)
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});

        __cancelOrder({
            _orderId: orderOutput.orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp
        });

        // Attempt to call notifyCancel
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionLib.InvalidReferenceId.selector));
        vm.prank(address(aliceOrderManager));
        aliceExternalPosition.notifyCancel({_referenceId: bytes32(orderOutput.orderId)});
    }

    function test_placeOrderWithRefId_tracksReferenceId() public {
        // Place an order with reference ID
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrderWithRefId({_inverse: false});

        // Verify the order was created
        assertEq(orderOutput.orderId, aliceExternalPosition.getOrderIds()[0], "Incorrect orderId");
        assertTrue(aliceExternalPosition.isPendingReferenceId(bytes32(orderOutput.orderId)), "Incorrect reference ID");

        // Verify the reference ID is tracked as pending
        uint256 orderId = orderOutput.orderId;
        bytes32 expectedReferenceId = bytes32(orderId);

        // Verify that notifySettle works with the correct reference ID
        // First settle the order externally
        __settleOrder({
            _orderId: orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: block.timestamp,
            _settlementAmount: orderOutput.limitAmountToGet * 2
        });

        // Now notifySettle should work with the tracked reference ID
        vm.prank(address(aliceOrderManager));
        aliceExternalPosition.notifySettle(address(buyToken), 0, expectedReferenceId);

        // Verify the order was removed
        assertEq(aliceExternalPosition.getOrderIds().length, 0, "Order should be removed");

        // Verify the reference ID is no longer pending
        assertFalse(
            aliceExternalPosition.isPendingReferenceId(expectedReferenceId), "Reference ID should not be pending"
        );
    }

    function test_referenceIdManipulationAttack_prevented() public {
        // This test simulates the attack described in the audit
        // 1. Create a regular order
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrder({_inverse: false});
        uint256 orderId = orderOutput.orderId;

        // 2. Settle the order so WETH is held within the EP
        __settleOrder({
            _orderId: orderId,
            _limitAmountToGet: orderOutput.limitAmountToGet,
            _timestamp: orderOutput.timestamp,
            _settlementAmount: orderOutput.limitAmountToGet * 2
        });

        // 3. Attempt to manipulate by calling notifySettle with a malicious reference ID
        // that was NOT created by this EP (using a different order ID)
        bytes32 maliciousReferenceId = bytes32(orderId);

        // This should fail because the reference ID wasn't tracked by this EP
        vm.expectRevert(abi.encodeWithSelector(IAliceV2PositionLib.InvalidReferenceId.selector));
        vm.prank(address(aliceOrderManager));
        aliceExternalPosition.notifySettle(address(buyToken), 0, maliciousReferenceId);

        // Verify the order is still tracked (attack failed)
        assertEq(aliceExternalPosition.getOrderIds().length, 1, "Order should still be tracked");
        assertEq(aliceExternalPosition.getOrderIds()[0], orderId, "Order ID should match");
    }

    function test_sweep_removesReferenceIdForOrderWithRefId() public {
        // 1. Place an order with reference ID
        BuildAndPlaceOrderOutput memory orderOutput = __buildAndPlaceOrderWithRefId({_inverse: false});
        uint256 orderId = orderOutput.orderId;
        bytes32 referenceId = bytes32(orderId);

        // 2. Cancel the order so that funds are available for sweeping
        __cancelOrder({
            _orderId: orderId, _limitAmountToGet: orderOutput.limitAmountToGet, _timestamp: orderOutput.timestamp
        });

        // 3. Sweep the order
        __sweep(IAliceV2PositionProd.SweepActionArgs({orderIds: toArray(orderId)}));

        // 4. Verify that both the order and reference ID have been removed
        assertEq(aliceExternalPosition.getOrderIds().length, 0, "Order should be removed from storage");
        assertFalse(
            aliceExternalPosition.isPendingReferenceId(referenceId), "Reference ID should be removed from storage"
        );

        // Verify the order details are cleared
        assertEq(
            0,
            aliceExternalPosition.getOrderDetails({_orderId: orderId}).outgoingAmount,
            "Order details should be cleared"
        );
    }
}

contract AliceWbtcUsdcTestEthereum is AliceTestBase {
    function setUp() public override {
        __initialize({
            _aliceOrderManagerAddress: ETHEREUM_ALICE_ORDER_MANAGER,
            _sellToken: ETHEREUM_USDT,
            _buyToken: ETHEREUM_USDC,
            _secondarySellToken: ETHEREUM_WBTC,
            _secondaryBuyToken: ETHEREUM_LINK,
            _chainId: ETHEREUM_CHAIN_ID,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE_ALICE
        });
    }
}

contract AliceEthUsdcTestEthereum is AliceTestBase {
    function setUp() public override {
        __initialize({
            _aliceOrderManagerAddress: ETHEREUM_ALICE_ORDER_MANAGER,
            _sellToken: ALICE_NATIVE_ASSET_ADDRESS,
            _buyToken: ETHEREUM_USDC,
            _secondarySellToken: ETHEREUM_WBTC,
            _secondaryBuyToken: ETHEREUM_LINK,
            _chainId: ETHEREUM_CHAIN_ID,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE_ALICE
        });
    }
}

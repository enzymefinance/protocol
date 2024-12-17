// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IGMXV2DataStore} from "../../../../../external-interfaces/IGMXV2DataStore.sol";
import {IGMXV2Event} from "../../../../../external-interfaces/IGMXV2Event.sol";
import {IGMXV2ExchangeRouter} from "../../../../../external-interfaces/IGMXV2ExchangeRouter.sol";
import {IGMXV2Market} from "../../../../../external-interfaces/IGMXV2Market.sol";
import {IGMXV2Order} from "../../../../../external-interfaces/IGMXV2Order.sol";
import {IGMXV2Position} from "../../../../../external-interfaces/IGMXV2Position.sol";
import {IGMXV2Price} from "../../../../../external-interfaces/IGMXV2Price.sol";
import {IGMXV2Reader} from "../../../../../external-interfaces/IGMXV2Reader.sol";
import {IGMXV2RoleStore} from "../../../../../external-interfaces/IGMXV2RoleStore.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";

import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {Bytes32ArrayLib} from "../../../../../utils/0.8.19/Bytes32ArrayLib.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";

import {GMXV2LeverageTradingPositionLibBase1} from "./bases/GMXV2LeverageTradingPositionLibBase1.sol";

import {GMXV2LeverageTradingPositionLibManagedAssets} from "./GMXV2LeverageTradingPositionLibManagedAssets.sol";
import {GMXV2LeverageTradingPositionMixin} from "./GMXV2LeverageTradingPositionMixin.sol";
import {IGMXV2LeverageTradingPosition} from "./IGMXV2LeverageTradingPosition.sol";

/// @title GMXV2LeverageTradingPositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for GMXV2 Leverage Trading positions
contract GMXV2LeverageTradingPositionLib is
    GMXV2LeverageTradingPositionMixin,
    IGMXV2LeverageTradingPosition,
    GMXV2LeverageTradingPositionLibBase1,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using Bytes32ArrayLib for bytes32[];
    using SafeERC20 for IERC20;

    bytes32 private constant CLAIMABLE_COLLATERAL_AMOUNT_DATA_STORE_KEY =
        keccak256(abi.encode("CLAIMABLE_COLLATERAL_AMOUNT"));
    bytes32 private constant CLAIMABLE_COLLATERAL_TIME_DIVISOR_DATA_STORE_KEY =
        keccak256(abi.encode("CLAIMABLE_COLLATERAL_TIME_DIVISOR"));
    bytes32 private constant CONTROLLER_ROLE_STORE_KEY = keccak256(abi.encode("CONTROLLER"));

    uint256 public immutable CALLBACK_GAS_LIMIT;
    GMXV2LeverageTradingPositionLibManagedAssets public immutable MANAGED_ASSETS_LIB;
    bytes32 public immutable REFERRAL_CODE;
    address public immutable REFERRAL_STORAGE_ADDRESS;
    IGMXV2RoleStore public immutable ROLE_STORE;
    address public immutable UI_FEE_RECEIVER_ADDRESS;
    IWETH public immutable WRAPPED_NATIVE_TOKEN;

    error InvalidActionId();

    error InvalidCallbackAccount();

    error InvalidHandler();

    error InvalidOrderType(IGMXV2Order.OrderType orderType);

    /// @dev Assert that the caller is the GMX handler
    modifier onlyHandler() {
        __assertHandler(msg.sender);
        _;
    }

    /// @dev Assert that the account is external position. It used in a callback to check that order was created by the external position
    modifier onlyExternalPosition(address _account) {
        if (_account != address(this)) {
            revert InvalidCallbackAccount();
        }
        _;
    }

    constructor(
        uint256 _callbackGasLimit,
        IGMXV2DataStore _dataStore,
        GMXV2LeverageTradingPositionLibManagedAssets _managedAssetsLib,
        IGMXV2Reader _reader,
        bytes32 _referralCode,
        address _referralStorageAddress,
        IGMXV2RoleStore _roleStore,
        address _uiFeeReceiverAddress,
        IWETH _wrappedNativeToken
    ) GMXV2LeverageTradingPositionMixin(_dataStore, _reader) {
        CALLBACK_GAS_LIMIT = _callbackGasLimit;
        MANAGED_ASSETS_LIB = _managedAssetsLib;
        REFERRAL_CODE = _referralCode;
        REFERRAL_STORAGE_ADDRESS = _referralStorageAddress;
        ROLE_STORE = _roleStore;
        UI_FEE_RECEIVER_ADDRESS = _uiFeeReceiverAddress;
        WRAPPED_NATIVE_TOKEN = _wrappedNativeToken;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    ///////////////////////
    // CALLBACK HANDLERS //
    ///////////////////////

    /// @dev This is the callback called by GMX after every order execution. We implement the callback in order to track "claimable collateral" at the moment it is created, because otherwise it is not possible to calculate it purely on-chain.
    /// For decrease orders, we track the claimable collateral amount if the negative threshold of the price impact was exceeded
    /// We handle only decrease orders types (MarketDecrease, StopLossDecrease, LimitDecrease, Liquidation).
    /// If new order types are added in the future, this function might need to be updated.
    function afterOrderExecution(bytes32, IGMXV2Order.Props memory _order, IGMXV2Event.EventLogData memory)
        external
        onlyHandler
        onlyExternalPosition(_order.addresses.account)
    {
        // Duplicate GMX time key calculation logic.
        // https://github.com/gmx-io/gmx-synthetics/blob/5173cbeb196ed5596373acd71c75a5c7a60a98f5/contracts/market/MarketUtils.sol#L541
        uint256 timeKey = block.timestamp / DATA_STORE.getUint(CLAIMABLE_COLLATERAL_TIME_DIVISOR_DATA_STORE_KEY);

        IGMXV2Market.Props memory market = __getMarketInfo(_order.addresses.market);

        __handleClaimableCollateral({_market: _order.addresses.market, _token: market.longToken, _timeKey: timeKey});

        // Some GMX markets have identical long and short tokens. In that case, we need to avoid adding the same claimable collateral twice.
        if (market.longToken != market.shortToken) {
            __handleClaimableCollateral({_market: _order.addresses.market, _token: market.shortToken, _timeKey: timeKey});
        }
    }

    //////////////////////
    // ACTIONS HANDLERS //
    //////////////////////

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));
        if (actionId == uint256(Actions.CreateOrder)) {
            __createOrder(actionArgs);
        } else if (actionId == uint256(Actions.UpdateOrder)) {
            __updateOrder(actionArgs);
        } else if (actionId == uint256(Actions.CancelOrder)) {
            __cancelOrder(actionArgs);
        } else if (actionId == uint256(Actions.ClaimFundingFees)) {
            __claimFundingFees(actionArgs);
        } else if (actionId == uint256(Actions.ClaimCollateral)) {
            __claimCollateral(actionArgs);
        } else if (actionId == uint256(Actions.Sweep)) {
            __sweep();
        } else {
            revert InvalidActionId();
        }
    }

    /// @dev Helper to create an order via the GMX ExchangeRouter
    /// supported order types: MarketIncrease (increase long/short position), MarketDecrease (decrease long/short position), StopLossDecrease (set stop loss), LimitDecrease (set take profit)
    function __createOrder(bytes memory _actionArgs) private {
        IGMXV2LeverageTradingPosition.CreateOrderActionArgs memory createOrderArgs =
            abi.decode(_actionArgs, (IGMXV2LeverageTradingPosition.CreateOrderActionArgs));

        __assertHandler(createOrderArgs.exchangeRouter);

        if (createOrderArgs.orderType == IGMXV2Order.OrderType.MarketIncrease) {
            // set the callback contract on the GMX ExchangeRouter, it will be called on liquidations and auto deleveraging
            // the callback will be set only once per market. MarketIncrease is the good place to set this, as it is the first necessary action to build a GMXV2 position
            __setSavedCallbackContract({
                _exchangeRouter: createOrderArgs.exchangeRouter,
                _market: createOrderArgs.addresses.market
            });

            __createMarketIncreaseOrder(createOrderArgs);
        } else if (
            createOrderArgs.orderType == IGMXV2Order.OrderType.MarketDecrease
                || createOrderArgs.orderType == IGMXV2Order.OrderType.StopLossDecrease
                || createOrderArgs.orderType == IGMXV2Order.OrderType.LimitDecrease
        ) {
            __createMarketDecreaseOrder(createOrderArgs);
        } else {
            revert InvalidOrderType(createOrderArgs.orderType);
        }
    }

    /// @dev Helper to handle the creation of a MarketIncrease order
    function __createMarketIncreaseOrder(IGMXV2LeverageTradingPosition.CreateOrderActionArgs memory _createOrderArgs)
        private
    {
        address orderVaultAddress = __getOrderVaultAddress(_createOrderArgs.exchangeRouter);

        IERC20(_createOrderArgs.addresses.initialCollateralToken).safeTransfer({
            _to: orderVaultAddress,
            _value: _createOrderArgs.numbers.initialCollateralDeltaAmount
        });

        // if the collateral is the wrapped native token, the execution fee is already included in the initialCollateralDeltaAmount
        // related code: https://github.com/gmx-io/gmx-synthetics/blob/5173cbeb196ed5596373acd71c75a5c7a60a98f5/contracts/order/OrderUtils.sol#L81
        if (_createOrderArgs.addresses.initialCollateralToken != address(WRAPPED_NATIVE_TOKEN)) {
            IERC20(address(WRAPPED_NATIVE_TOKEN)).safeTransfer({
                _to: orderVaultAddress,
                _value: _createOrderArgs.numbers.executionFee
            });
        }

        IGMXV2ExchangeRouter(_createOrderArgs.exchangeRouter).createOrder(__getCreateOrderParams(_createOrderArgs));

        // track both market assets (long and short tokens) to keep track of receivable assets in case of liquidation/cancellation/decrease.
        __trackMarketAssets(_createOrderArgs.addresses.market);

        // track market to keep track of claimable funding fees
        __addTrackedMarket(_createOrderArgs.addresses.market);
    }

    /// @dev Helper to handle the creation of the decrease order types (MarketDecrease, StopLossDecrease, LimitDecrease)
    function __createMarketDecreaseOrder(IGMXV2LeverageTradingPosition.CreateOrderActionArgs memory _createOrderArgs)
        private
    {
        IERC20(address(WRAPPED_NATIVE_TOKEN)).safeTransfer({
            _to: __getOrderVaultAddress(_createOrderArgs.exchangeRouter),
            _value: _createOrderArgs.numbers.executionFee
        });

        IGMXV2ExchangeRouter(_createOrderArgs.exchangeRouter).createOrder(__getCreateOrderParams(_createOrderArgs));
    }

    /// @dev Helper to handle the update of an order via the GMX ExchangeRouter
    function __updateOrder(bytes memory _actionArgs) private {
        IGMXV2LeverageTradingPosition.UpdateOrderActionArgs memory updateOrderArgs =
            abi.decode(_actionArgs, (IGMXV2LeverageTradingPosition.UpdateOrderActionArgs));

        __assertHandler(updateOrderArgs.exchangeRouter);

        if (updateOrderArgs.executionFeeIncrease != 0) {
            IERC20(address(WRAPPED_NATIVE_TOKEN)).safeTransfer({
                _to: __getOrderVaultAddress(updateOrderArgs.exchangeRouter),
                _value: updateOrderArgs.executionFeeIncrease
            });
        }

        IGMXV2ExchangeRouter(updateOrderArgs.exchangeRouter).updateOrder({
            _key: updateOrderArgs.key,
            _sizeDeltaUsd: updateOrderArgs.sizeDeltaUsd,
            _acceptablePrice: updateOrderArgs.acceptablePrice,
            _triggerPrice: updateOrderArgs.triggerPrice,
            _minOutputAmount: updateOrderArgs.minOutputAmount,
            _validFromTime: updateOrderArgs.validFromTime,
            _autoCancel: updateOrderArgs.autoCancel
        });
    }

    /// @dev Helper to handle the cancellation of an order via the GMX ExchangeRouter
    function __cancelOrder(bytes memory _actionArgs) private {
        IGMXV2LeverageTradingPosition.CancelOrderActionArgs memory cancelOrderArgs =
            abi.decode(_actionArgs, (IGMXV2LeverageTradingPosition.CancelOrderActionArgs));

        __assertHandler(cancelOrderArgs.exchangeRouter);

        IGMXV2Order.Props memory order = READER.getOrder({_dataStore: DATA_STORE, _orderKey: cancelOrderArgs.key});

        IGMXV2ExchangeRouter(cancelOrderArgs.exchangeRouter).cancelOrder(cancelOrderArgs.key);

        // transfer the rest of the execution fees to the vault
        __transferAllNativeTokenToSender();

        // if the order was a market increase order, transfer the collateral back to the vault
        if (order.numbers.orderType == IGMXV2Order.OrderType.MarketIncrease) {
            IERC20(order.addresses.initialCollateralToken).safeTransfer({
                _to: msg.sender,
                _value: order.numbers.initialCollateralDeltaAmount
            });
        }
    }

    /// @dev Helper to handle the claiming of funding fees via the GMX ExchangeRouter
    /// more about funding fees: https://docs.gmx.io/docs/trading/v2#funding-fees , https://github.com/gmx-io/gmx-synthetics/tree/5173cbeb196ed5596373acd71c75a5c7a60a98f5?tab=readme-ov-file#funding-fees
    function __claimFundingFees(bytes memory _actionArgs) private {
        IGMXV2LeverageTradingPosition.ClaimFundingFeesActionArgs memory claimFundingFeesArgs =
            abi.decode(_actionArgs, (IGMXV2LeverageTradingPosition.ClaimFundingFeesActionArgs));

        __assertHandler(claimFundingFeesArgs.exchangeRouter);

        IGMXV2ExchangeRouter(claimFundingFeesArgs.exchangeRouter).claimFundingFees({
            _markets: claimFundingFeesArgs.markets,
            _tokens: claimFundingFeesArgs.tokens,
            _receiver: msg.sender
        });

        // Retrieve all active markets from the current positions
        IGMXV2Position.Props[] memory positions = __getAccountPositions();

        address[] memory activeMarkets;

        for (uint256 i; i < positions.length; i++) {
            activeMarkets = activeMarkets.addUniqueItem(positions[i].addresses.market);
        }

        IGMXV2Order.Props[] memory orders = __getAccountOrders();

        for (uint256 i; i < orders.length; i++) {
            IGMXV2Order.Props memory order = orders[i];
            if (order.numbers.orderType == IGMXV2Order.OrderType.MarketIncrease) {
                activeMarkets = activeMarkets.addUniqueItem(order.addresses.market);
            }
        }

        // Clean up the tracked markets from storage
        // We want to remove tracked markets that have no active positions and no outstanding claimable funding fees
        for (uint256 i; i < claimFundingFeesArgs.markets.length; i++) {
            address claimedMarket = claimFundingFeesArgs.markets[i];

            // if market is active, or already not tracked, skip the market as it shouldn't be cleared
            if (activeMarkets.contains(claimedMarket) || !trackedMarkets.contains(claimedMarket)) {
                continue;
            }

            IGMXV2Market.Props memory marketInfo = __getMarketInfo(claimedMarket);

            // if amount left to claim equals 0 remove the market from the tracked markets
            // A claimed market could still have claimable funding fees if one of the tokens has outstanding fees but was not specified in the claimableFundingFeesArgs
            if (
                __getClaimableFundingFees({_market: marketInfo.marketToken, _token: marketInfo.longToken})
                    + (
                        marketInfo.longToken == marketInfo.shortToken
                            ? 0
                            : __getClaimableFundingFees({_market: claimedMarket, _token: marketInfo.shortToken})
                    ) == 0
            ) {
                __removeTrackedMarket(claimedMarket);
            }
        }
    }

    /// @dev Helper to handle the claiming of collateral via the GMX ExchangeRouter
    /// more about claiming collateral: https://docs.gmx.io/docs/trading/v2#price-impact-rebates
    function __claimCollateral(bytes memory _actionArgs) private {
        IGMXV2LeverageTradingPosition.ClaimCollateralActionArgs memory claimCollateralArgs =
            abi.decode(_actionArgs, (IGMXV2LeverageTradingPosition.ClaimCollateralActionArgs));

        __assertHandler(claimCollateralArgs.exchangeRouter);

        IGMXV2ExchangeRouter(claimCollateralArgs.exchangeRouter).claimCollateral({
            _markets: claimCollateralArgs.markets,
            _tokens: claimCollateralArgs.tokens,
            _timeKeys: claimCollateralArgs.timeKeys,
            _receiver: msg.sender
        });

        // collateral can be released for the user in several rounds, so we need to check if all the collateral was claimed
        // if it was claimed entirely, clean up claimable collateral keys, and don't track them anymore
        for (uint256 i; i < claimCollateralArgs.timeKeys.length; i++) {
            bytes32 claimableCollateralAmountKey = __claimableCollateralAmountKey({
                _market: claimCollateralArgs.markets[i],
                _token: claimCollateralArgs.tokens[i],
                _timeKey: claimCollateralArgs.timeKeys[i]
            });
            bytes32 claimedCollateralAmountKey = __claimedCollateralAmountKey({
                _market: claimCollateralArgs.markets[i],
                _token: claimCollateralArgs.tokens[i],
                _timeKey: claimCollateralArgs.timeKeys[i]
            });

            uint256 claimableCollateral = DATA_STORE.getUint(claimableCollateralAmountKey);
            uint256 claimedCollateral = DATA_STORE.getUint(claimedCollateralAmountKey);

            // Check if all the collateral was claimed.
            // In GMX, MarketUtils.claimCollateral() computes the amount of collateral that can be claimed by an account for a market. As the claimable collateral can be released over time, a claimableFactor exists to determine the amount of collateral that can be claimed at a given time.
            // An additional check is then performed that adjustedClaimableAmount > claimedAmount. Therefore, GMX remains conservative by handling the unlikely case where the claimed collateral amount exceeds the claimable collateral amount, and we do the same here.
            if (claimableCollateral <= claimedCollateral) {
                // even if the key won't be removed, because callback that adds collateral key wasn't called (due to for example out of gas error), this code won't revert
                delete claimableCollateralKeyToClaimableCollateralInfo[claimableCollateralAmountKey];
                bool removed = claimableCollateralKeys.removeStorageItem(claimableCollateralAmountKey);

                if (removed) {
                    emit ClaimableCollateralRemoved(claimableCollateralAmountKey);
                }
            }
        }
    }

    /// @dev sweep tracked assets to the vault.
    /// Also removes stale market increase orders, if some of them were not removed due to callback failure
    /// Also updates the tracked assets list, by checking the current position and market increase orders
    function __sweep() private {
        address[] memory trackedAssetsMem = trackedAssets;

        // Begin by cleaning up tracked assets in storage to get rid of stale tracked assets
        // Then, re-add assets from the current position and market increase orders
        delete trackedAssets;
        emit TrackedAssetsCleared();

        IGMXV2Position.Props[] memory positions = __getAccountPositions();

        // add tracked assets for current positions
        for (uint256 i; i < positions.length; i++) {
            IGMXV2Position.Props memory position = positions[i];
            if (position.numbers.collateralAmount != 0) {
                __trackMarketAssets(position.addresses.market);
            }
        }

        // track the assets of the pending market increase orders
        IGMXV2Order.Props[] memory orders = __getAccountOrders();

        for (uint256 i; i < orders.length; i++) {
            IGMXV2Order.Props memory order = orders[i];
            if (order.numbers.orderType == IGMXV2Order.OrderType.MarketIncrease) {
                __trackMarketAssets(order.addresses.market);
            }
        }

        // transfer the native token and the tracked assets back to the vault

        __transferAllNativeTokenToSender();

        for (uint256 i; i < trackedAssetsMem.length; i++) {
            address assetToTrack = trackedAssetsMem[i];
            uint256 assetToTrackBalance = IERC20(assetToTrack).balanceOf(address(this));

            if (assetToTrackBalance != 0) {
                IERC20(assetToTrack).safeTransfer({_to: msg.sender, _value: assetToTrackBalance});
            }
        }
    }

    ///////////////////
    // MISC HELPERS //
    //////////////////

    /// @dev Helper to transfer all EP native token balance to the vault
    function __transferAllNativeTokenToSender() private {
        Address.sendValue({recipient: payable(msg.sender), amount: address(this).balance});
    }

    /// @dev Helper to get claimable collateral amount key
    function __claimableCollateralAmountKey(address _market, address _token, uint256 _timeKey)
        private
        view
        returns (bytes32 key_)
    {
        return keccak256(
            abi.encode(
                CLAIMABLE_COLLATERAL_AMOUNT_DATA_STORE_KEY,
                _market,
                _token,
                _timeKey,
                address(this) // account
            )
        );
    }

    /// @dev Helper to set the saved callback contract on the GMX ExchangeRouter, it will be called on liquidations and auto deleveraging
    function __setSavedCallbackContract(address _exchangeRouter, address _market) private {
        if (!marketToIsCallbackContractSet[_market]) {
            IGMXV2ExchangeRouter(_exchangeRouter).setSavedCallbackContract({
                _market: _market,
                _callbackContract: address(this)
            });

            marketToIsCallbackContractSet[_market] = true;

            emit CallbackContractSet(_market);
        }
    }

    /// @dev Add claimable collateral if impact threshold was exceeded during the position decrease
    function __handleClaimableCollateral(address _market, address _token, uint256 _timeKey) private {
        uint256 claimableCollateral =
            DATA_STORE.getUint(__claimableCollateralAmountKey({_market: _market, _token: _token, _timeKey: _timeKey}));

        // if the negative impact threshold wasn't exceeded, we don't need to track the claimable collateral
        if (claimableCollateral != 0) {
            __addClaimableCollateral({_market: _market, _token: _token, _timeKey: _timeKey});
        }
    }

    /// @dev Helper to add claimable collateral to storage
    function __addClaimableCollateral(address _market, address _token, uint256 _timeKey) private {
        bytes32 key = __claimableCollateralAmountKey({_market: _market, _token: _token, _timeKey: _timeKey});

        // skip if the claimable collateral key already exists
        if (claimableCollateralKeyToClaimableCollateralInfo[key].market != address(0)) {
            return;
        }

        claimableCollateralKeys.push(key);
        claimableCollateralKeyToClaimableCollateralInfo[key] =
            ClaimableCollateralInfo({token: _token, market: _market, timeKey: _timeKey});

        emit ClaimableCollateralAdded({claimableCollateralKey: key, token: _token, market: _market, timeKey: _timeKey});
    }

    /// @dev Assert that account is the GMX handler
    function __assertHandler(address _account) private view {
        if (!ROLE_STORE.hasRole({_account: _account, _roleKey: CONTROLLER_ROLE_STORE_KEY})) {
            revert InvalidHandler();
        }
    }

    /// @dev Helper to get the order vault address from the GMX ExchangeRouter
    function __getOrderVaultAddress(address _exchangeRouterAddress) private view returns (address orderVault_) {
        return IGMXV2ExchangeRouter(_exchangeRouterAddress).orderHandler().orderVault();
    }

    /// @dev Helper to get the create order params
    function __getCreateOrderParams(IGMXV2LeverageTradingPosition.CreateOrderActionArgs memory _createOrderArgs)
        private
        view
        returns (IGMXV2ExchangeRouter.CreateOrderParams memory createOrderParams_)
    {
        IGMXV2ExchangeRouter.CreateOrderParamsAddresses memory createOrderParamsAddresses = IGMXV2ExchangeRouter
            .CreateOrderParamsAddresses({
            receiver: address(this),
            cancellationReceiver: address(this),
            callbackContract: _createOrderArgs.orderType == IGMXV2Order.OrderType.MarketIncrease
                ? address(0)
                : address(this),
            uiFeeReceiver: UI_FEE_RECEIVER_ADDRESS,
            market: _createOrderArgs.addresses.market,
            initialCollateralToken: _createOrderArgs.addresses.initialCollateralToken,
            swapPath: new address[](0)
        });

        return IGMXV2ExchangeRouter.CreateOrderParams({
            addresses: createOrderParamsAddresses,
            numbers: IGMXV2ExchangeRouter.CreateOrderParamsNumbers({
                sizeDeltaUsd: _createOrderArgs.numbers.sizeDeltaUsd,
                initialCollateralDeltaAmount: _createOrderArgs.numbers.initialCollateralDeltaAmount,
                triggerPrice: _createOrderArgs.numbers.triggerPrice,
                acceptablePrice: _createOrderArgs.numbers.acceptablePrice,
                executionFee: _createOrderArgs.numbers.executionFee,
                callbackGasLimit: _createOrderArgs.orderType == IGMXV2Order.OrderType.MarketIncrease ? 0 : CALLBACK_GAS_LIMIT,
                minOutputAmount: _createOrderArgs.numbers.minOutputAmount,
                validFromTime: _createOrderArgs.numbers.validFromTime
            }),
            orderType: _createOrderArgs.orderType,
            decreasePositionSwapType: _createOrderArgs.decreasePositionSwapType,
            isLong: _createOrderArgs.isLong,
            shouldUnwrapNativeToken: false,
            autoCancel: _createOrderArgs.autoCancel,
            referralCode: REFERRAL_CODE
        });
    }

    /// @dev Helper to track the assets of a market
    function __trackMarketAssets(address _market) private {
        IGMXV2Market.Props memory market = __getMarketInfo(_market);
        __addTrackedAsset(market.longToken);
        if (market.longToken != market.shortToken) {
            __addTrackedAsset(market.shortToken);
        }
    }

    /// @dev Helper to add an asset to the tracked assets list if not already present
    function __addTrackedAsset(address _asset) private {
        if (!trackedAssets.storageArrayContains(_asset)) {
            trackedAssets.push(_asset);

            emit TrackedAssetAdded(_asset);
        }
    }

    /// @dev Helper to add a market to the tracked markets list if not already present
    function __addTrackedMarket(address _market) private {
        if (!trackedMarkets.storageArrayContains(_market)) {
            trackedMarkets.push(_market);

            emit TrackedMarketAdded(_market);
        }
    }

    /// @dev Helper to remove a market from the tracked markets list
    function __removeTrackedMarket(address _market) private {
        trackedMarkets.removeStorageItem(_market);

        emit TrackedMarketRemoved(_market);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {}

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        bytes memory returnData = Address.functionDelegateCall({
            target: address(MANAGED_ASSETS_LIB),
            data: abi.encodeWithSelector(GMXV2LeverageTradingPositionLibManagedAssets.getManagedAssets.selector)
        });

        return abi.decode(returnData, (address[], uint256[]));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Retrieves the claimable collateral keys
    /// @return claimableCollateralKeys_ The claimableCollateralKeys
    function getClaimableCollateralKeys() external view returns (bytes32[] memory claimableCollateralKeys_) {
        return claimableCollateralKeys;
    }

    /// @notice Retrieves the claimable collateral key token
    /// @param _key The claimable collateral key
    /// @return info_ The claimable collateral info
    function getClaimableCollateralKeyToClaimableCollateralInfo(bytes32 _key)
        public
        view
        returns (ClaimableCollateralInfo memory info_)
    {
        return claimableCollateralKeyToClaimableCollateralInfo[_key];
    }

    /// @notice Retrieves the status of whether the callback contract is set for a given market.
    /// @param _market The address of the market to check.
    /// @return isCallbackContractSet_ A boolean value indicating if the callback contract is set for the specified market.
    function getMarketToIsCallbackContractSet(address _market) public view returns (bool isCallbackContractSet_) {
        return marketToIsCallbackContractSet[_market];
    }

    /// @notice Retrieves the tracked assets
    /// @return trackedAssets_ The trackedAssets
    function getTrackedAssets() public view returns (address[] memory trackedAssets_) {
        return trackedAssets;
    }

    /// @notice Retrieves the tracked markets
    /// @return trackedMarkets_ The trackedMarkets
    function getTrackedMarkets() public view returns (address[] memory trackedMarkets_) {
        return trackedMarkets;
    }
}

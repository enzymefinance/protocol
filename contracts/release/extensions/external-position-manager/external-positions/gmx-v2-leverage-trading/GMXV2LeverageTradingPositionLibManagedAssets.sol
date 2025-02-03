// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IGMXV2ChainlinkPriceFeedProvider} from "../../../../../external-interfaces/IGMXV2ChainlinkPriceFeedProvider.sol";
import {IGMXV2DataStore} from "../../../../../external-interfaces/IGMXV2DataStore.sol";
import {IGMXV2Market} from "../../../../../external-interfaces/IGMXV2Market.sol";
import {IGMXV2Order} from "../../../../../external-interfaces/IGMXV2Order.sol";
import {IGMXV2Position} from "../../../../../external-interfaces/IGMXV2Position.sol";
import {IGMXV2Price} from "../../../../../external-interfaces/IGMXV2Price.sol";
import {IGMXV2Reader} from "../../../../../external-interfaces/IGMXV2Reader.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";

import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {Uint256ArrayLib} from "../../../../../utils/0.8.19/Uint256ArrayLib.sol";

import {GMXV2LeverageTradingPositionLibBase1} from "./bases/GMXV2LeverageTradingPositionLibBase1.sol";

import {GMXV2LeverageTradingPositionMixin} from "./GMXV2LeverageTradingPositionMixin.sol";

/// @title GMXV2LeverageTradingPositionLibManagedAssets Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A library-like contract to be delegate-called by GMXV2LeverageTradingPositionLib.getManagedAssets()"
/// @dev Addresses contract size compiler error in GMXV2LeverageTradingPositionLib"
contract GMXV2LeverageTradingPositionLibManagedAssets is
    GMXV2LeverageTradingPositionMixin,
    GMXV2LeverageTradingPositionLibBase1,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using Uint256ArrayLib for uint256[];

    bytes32 private constant ACCOUNT_POSITION_LIST_DATA_STORE_KEY = keccak256(abi.encode("ACCOUNT_POSITION_LIST"));

    IGMXV2ChainlinkPriceFeedProvider public immutable CHAINLINK_PRICE_FEED_PROVIDER;
    address public immutable REFERRAL_STORAGE_ADDRESS;
    address public immutable UI_FEE_RECEIVER_ADDRESS;
    IWETH public immutable WRAPPED_NATIVE_TOKEN;

    constructor(
        IGMXV2ChainlinkPriceFeedProvider _chainlinkPriceFeedProvider,
        IGMXV2DataStore _dataStore,
        IGMXV2Reader _reader,
        address _referralStorageAddress,
        address _uiFeeReceiverAddress,
        IWETH _wrappedNativeToken
    ) GMXV2LeverageTradingPositionMixin(_dataStore, _reader) {
        CHAINLINK_PRICE_FEED_PROVIDER = _chainlinkPriceFeedProvider;
        REFERRAL_STORAGE_ADDRESS = _referralStorageAddress;
        UI_FEE_RECEIVER_ADDRESS = _uiFeeReceiverAddress;
        WRAPPED_NATIVE_TOKEN = _wrappedNativeToken;
    }

    /// @dev Get token price from Chainlink
    function __getTokenPrice(address _token) private view returns (IGMXV2Price.Price memory price_) {
        // for the chainlink price feed provider that we use the data parameter is always empty, as it is not used by the provider
        IGMXV2ChainlinkPriceFeedProvider.ValidatedPrice memory validatedPrice =
            CHAINLINK_PRICE_FEED_PROVIDER.getOraclePrice({_token: _token, _data: ""});

        return IGMXV2Price.Price({min: validatedPrice.min, max: validatedPrice.max});
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 5 ways that positive value can be contributed to this position
    /// 1. Collateral in the GMX positions, taking into account price impact and profit/loss
    /// 2. Pending orders: deposited collateral in market increase orders, plus execution fees of all orders
    /// 3. Assets held by the External Position. Those assets are monitored via the trackedAssets variable
    /// 4. Collateral that eventually can be claimed from GMX positions where collateral was freed up from decreased positions.
    /// 5. Funding fees that can be claimed from the GMX protocol
    function getManagedAssets() external view returns (address[] memory assets_, uint256[] memory amounts_) {
        // 1. Get the value of the collateral in active GMX positions, taking into account price impact and profit/loss
        IGMXV2Position.Props[] memory positions = __getAccountPositions();

        address[] memory markets = new address[](positions.length);
        IGMXV2Market.MarketPrices[] memory marketPrices = new IGMXV2Market.MarketPrices[](positions.length);
        for (uint256 i; i < marketPrices.length; i++) {
            address marketAddress = positions[i].addresses.market;
            IGMXV2Market.Props memory market = __getMarketInfo(marketAddress);
            markets[i] = marketAddress;

            marketPrices[i] = IGMXV2Market.MarketPrices({
                indexTokenPrice: __getTokenPrice(market.indexToken),
                longTokenPrice: __getTokenPrice(market.longToken),
                shortTokenPrice: __getTokenPrice(market.shortToken)
            });
        }

        IGMXV2Position.PositionInfo[] memory positionInfos = READER.getAccountPositionInfoList({
            _dataStore: DATA_STORE,
            _referralStorage: REFERRAL_STORAGE_ADDRESS,
            _account: address(this),
            _markets: markets,
            _prices: marketPrices,
            _uiFeeReceiver: UI_FEE_RECEIVER_ADDRESS,
            _start: 0,
            _end: type(uint256).max
        });

        for (uint256 i; i < positionInfos.length; i++) {
            IGMXV2Position.PositionInfo memory positionInfo = positionInfos[i];

            uint256 totalCollateralAmount = positionInfo.position.numbers.collateralAmount;
            // We use priceImpactDiffUsd + pnlAfterPriceImpactUsd to get the total value of the position
            // priceImpactDiffUsd reflects the price of the collateral that will be able to be claimed after withdrawal
            // pnlAfterPriceImpactUsd reflects the value of the position after the price impact
            // combining those two values we get the most accurate value of the position after withdrawal
            // https://docs.gmx.io/docs/trading/v2#price-impact-rebates
            if (positionInfo.executionPriceResult.priceImpactDiffUsd != 0) {
                // use collateralTokenPrice max to price in favour of the GMX protocol, so the value of the position is closer to the real value after position decrease would happen.
                // GMX protocol always prices in favour of itself, in order to prevent any potential price manipulation attacks.

                totalCollateralAmount +=
                    positionInfo.executionPriceResult.priceImpactDiffUsd / positionInfo.fees.collateralTokenPrice.max;
            }

            if (positionInfo.pnlAfterPriceImpactUsd > 0) {
                // use collateralTokenPrice max to price in favour of the GMX protocol, so the value of the position is closer to the real value after position decrease would happen.
                // GMX protocol always prices in favour of itself, in order to prevent any potential price manipulation attacks.
                totalCollateralAmount +=
                    uint256(positionInfo.pnlAfterPriceImpactUsd) / positionInfo.fees.collateralTokenPrice.max;
            } else {
                // use collateralTokenPrice min to price in favour of the GMX protocol, so the value of the position is closer to the real value after position decrease would happen.
                // GMX protocol always prices in favour of itself, in order to prevent any potential price manipulation attacks.
                uint256 lossCollateralAmount =
                    uint256(-positionInfo.pnlAfterPriceImpactUsd) / positionInfo.fees.collateralTokenPrice.min;

                // loss can be greater than collateral amount, then we don't include it all.
                // Debt is per position, not per account. That is why negative value is not included in the getDebtAssets() as only the deposited collateral can be recovered by the GMXV2 protocol.
                if (lossCollateralAmount < totalCollateralAmount) {
                    totalCollateralAmount -= lossCollateralAmount;
                } else {
                    totalCollateralAmount = 0;
                }
            }

            // subtract the fees that the position had to pay if it would be closed at this moment
            if (positionInfo.fees.totalCostAmount < totalCollateralAmount) {
                totalCollateralAmount -= positionInfo.fees.totalCostAmount;
            } else {
                totalCollateralAmount = 0;
            }

            if (totalCollateralAmount != 0) {
                amounts_ = amounts_.addItem(totalCollateralAmount);
                assets_ = assets_.addItem(positionInfo.position.addresses.collateralToken);
            }
        }

        // 2. Get pending orders: deposited collateral in market increase orders, plus execution fees of all orders
        IGMXV2Order.Props[] memory orders = __getAccountOrders();

        uint256 totalExecutionFee;

        for (uint256 i; i < orders.length; i++) {
            IGMXV2Order.Props memory order = orders[i];

            if (order.numbers.orderType == IGMXV2Order.OrderType.MarketIncrease) {
                assets_ = assets_.addItem(order.addresses.initialCollateralToken);
                amounts_ = amounts_.addItem(order.numbers.initialCollateralDeltaAmount);
            }

            totalExecutionFee += order.numbers.executionFee;
        }

        if (totalExecutionFee != 0) {
            assets_ = assets_.addItem(address(WRAPPED_NATIVE_TOKEN));
            amounts_ = amounts_.addItem(totalExecutionFee);
        }

        // 3. Get the value of the assets held by the External Position. Those assets could be here because of the: liquidations, order cancellation, or refund of the execution fee
        for (uint256 i; i < trackedAssets.length; i++) {
            address trackedAsset = trackedAssets[i];
            uint256 trackedAssetsBalance = IERC20(trackedAsset).balanceOf(address(this));

            if (trackedAssetsBalance != 0) {
                assets_ = assets_.addItem(trackedAsset);
                amounts_ = amounts_.addItem(trackedAssetsBalance);
            }
        }

        uint256 nativeTokenBalance = address(this).balance;
        if (nativeTokenBalance != 0) {
            amounts_ = amounts_.addItem(nativeTokenBalance);
            assets_ = assets_.addItem(address(WRAPPED_NATIVE_TOKEN));
        }

        // 4. Get the value of the collateral that eventually can be claimed from GMX positions where collateral was freed up from decreased positions.
        for (uint256 i; i < claimableCollateralKeys.length; i++) {
            bytes32 key = claimableCollateralKeys[i];

            ClaimableCollateralInfo memory claimableCollateralInfo =
                claimableCollateralKeyToClaimableCollateralInfo[key];

            assets_ = assets_.addItem(claimableCollateralInfo.token);
            amounts_ = amounts_.addItem(
                DATA_STORE.getUint(key)
                    - DATA_STORE.getUint(
                        __claimedCollateralAmountKey({
                            _market: claimableCollateralInfo.market,
                            _token: claimableCollateralInfo.token,
                            _timeKey: claimableCollateralInfo.timeKey
                        })
                    ) // claimable collateral - claimed collateral
            );
        }

        // 5. Funding fees
        for (uint256 i; i < trackedMarkets.length; i++) {
            IGMXV2Market.Props memory marketInfo = __getMarketInfo(trackedMarkets[i]);
            uint256 fundingFeesLongToken =
                __getClaimableFundingFees({_market: marketInfo.marketToken, _token: marketInfo.longToken});

            if (fundingFeesLongToken != 0) {
                assets_ = assets_.addItem(marketInfo.longToken);
                amounts_ = amounts_.addItem(fundingFeesLongToken);
            }

            if (marketInfo.longToken != marketInfo.shortToken) {
                uint256 fundingFeesShortToken =
                    __getClaimableFundingFees({_market: marketInfo.marketToken, _token: marketInfo.shortToken});

                if (fundingFeesShortToken != 0) {
                    assets_ = assets_.addItem(marketInfo.shortToken);
                    amounts_ = amounts_.addItem(fundingFeesShortToken);
                }
            }
        }

        // Sum up everything
        return __aggregateAssetAmounts({_rawAssets: assets_, _rawAmounts: amounts_});
    }
}

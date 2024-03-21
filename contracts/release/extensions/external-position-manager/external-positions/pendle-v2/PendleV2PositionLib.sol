// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IPendleV2Market} from "../../../../../external-interfaces/IPendleV2Market.sol";
import {IPendleV2MarketFactory} from "../../../../../external-interfaces/IPendleV2MarketFactory.sol";
import {IPendleV2PrincipalToken} from "../../../../../external-interfaces/IPendleV2PrincipalToken.sol";
import {IPendleV2PtOracle} from "../../../../../external-interfaces/IPendleV2PtOracle.sol";
import {IPendleV2Router} from "../../../../../external-interfaces/IPendleV2Router.sol";
import {IPendleV2StandardizedYield} from "../../../../../external-interfaces/IPendleV2StandardizedYield.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {PendleLpOracleLib} from "../../../../../utils/0.8.19/pendle/adapted-libs/PendleLpOracleLib.sol";
import {PendlePtOracleLib} from "../../../../../utils/0.8.19/pendle/adapted-libs/PendlePtOracleLib.sol";
import {IPendleV2Market as IOracleLibPendleMarket} from
    "../../../../../utils/0.8.19/pendle/adapted-libs/interfaces/IPendleV2Market.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {PendleV2PositionLibBase1} from "./bases/PendleV2PositionLibBase1.sol";
import {IPendleV2Position} from "./IPendleV2Position.sol";
import {PendleV2PositionDataDecoder} from "./PendleV2PositionDataDecoder.sol";

/// @title PendleV2PositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Pendle V2 Positions
/// @dev See "POSITION VALUE" section for notes on pricing mechanism that must be considered by funds
contract PendleV2PositionLib is
    IPendleV2Position,
    PendleV2PositionDataDecoder,
    PendleV2PositionLibBase1,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeERC20 for IERC20;

    address internal constant NATIVE_ASSET_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 internal constant ORACLE_RATE_PRECISION = 1e18;
    address internal constant PENDLE_NATIVE_ASSET_ADDRESS = address(0);

    IAddressListRegistry internal immutable ADDRESS_LIST_REGISTRY;
    uint32 internal immutable MINIMUM_PRICING_DURATION;
    uint32 internal immutable MAXIMUM_PRICING_DURATION;
    uint256 internal immutable PENDLE_MARKET_FACTORIES_LIST_ID;
    IPendleV2Router internal immutable PENDLE_ROUTER;
    IPendleV2PtOracle internal immutable PRINCIPAL_TOKEN_ORACLE;
    IWETH private immutable WRAPPED_NATIVE_ASSET;

    constructor(
        address _addressListRegistry,
        uint32 _minimumPricingDuration,
        uint32 _maximumPricingDuration,
        uint256 _pendleMarketFactoriesListId,
        address _pendlePtOracleAddress,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    ) {
        ADDRESS_LIST_REGISTRY = IAddressListRegistry(_addressListRegistry);
        MINIMUM_PRICING_DURATION = _minimumPricingDuration;
        MAXIMUM_PRICING_DURATION = _maximumPricingDuration;
        PENDLE_MARKET_FACTORIES_LIST_ID = _pendleMarketFactoriesListId;
        PRINCIPAL_TOKEN_ORACLE = IPendleV2PtOracle(_pendlePtOracleAddress);
        PENDLE_ROUTER = IPendleV2Router(_pendleRouterAddress);
        WRAPPED_NATIVE_ASSET = IWETH(_wrappedNativeAssetAddress);
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.BuyPrincipalToken)) {
            __buyPrincipalToken(actionArgs);
        } else if (actionId == uint256(Actions.SellPrincipalToken)) {
            __sellPrincipalToken(actionArgs);
        } else if (actionId == uint256(Actions.AddLiquidity)) {
            __addLiquidity(actionArgs);
        } else if (actionId == uint256(Actions.RemoveLiquidity)) {
            __removeLiquidity(actionArgs);
        } else if (actionId == uint256(Actions.ClaimRewards)) {
            __claimRewards(actionArgs);
        }
    }

    /// @dev Helper to buy a Pendle principal token from an underlying token
    function __buyPrincipalToken(bytes memory _actionArgs) private {
        // Decode the actionArgs
        (
            address principalTokenAddress,
            IPendleV2Market market,
            uint32 pricingDuration,
            address depositTokenAddress,
            uint256 depositAmount,
            IPendleV2Router.ApproxParams memory guessPtOut,
            uint256 minPtOut
        ) = __decodeBuyPrincipalTokenActionArgs(_actionArgs);

        __handlePrincipalTokenInput({_principalTokenAddress: principalTokenAddress, _marketAddress: address(market)});
        __handleMarketAndDurationInput({_marketAddress: address(market), _duration: pricingDuration});

        (IPendleV2StandardizedYield syToken,,) = market.readTokens();

        // We can safely pass in 0 for minIncomingShares since we validate the final minPtOut.
        (uint256 syTokenAmount) = __mintSYToken({
            _syToken: syToken,
            _depositTokenAddress: depositTokenAddress,
            _depositAmount: depositAmount,
            _minIncomingShares: 0,
            _receiver: address(this)
        });

        __approveAssetMaxAsNeeded({
            _asset: address(syToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: syTokenAmount
        });

        // Unused since we do not need to perform a limit order.
        IPendleV2Router.LimitOrderData memory limit;

        // Convert SyToken to PT
        PENDLE_ROUTER.swapExactSyForPt({
            _receiver: address(this),
            _market: address(market),
            _exactSyIn: syTokenAmount,
            _minPtOut: minPtOut,
            _guessPtOut: guessPtOut,
            _limit: limit
        });
    }

    /// @dev Helper to sell a Pendle principal token for an underlying token
    function __sellPrincipalToken(bytes memory _actionArgs) private {
        // Decode the actionArgs
        (
            IPendleV2PrincipalToken principalToken,
            IPendleV2Market market,
            address withdrawalTokenAddress,
            uint256 withdrawalAmount,
            uint256 minIncomingAmount
        ) = __decodeSellPrincipalTokenActionArgs(_actionArgs);

        // Validate that the principal token is in storage
        require(
            getMarketForPrincipalToken(address(principalToken)) == address(market),
            "__sellPrincipalToken: invalid market address"
        );

        // Approve the principal token to be spent by the market
        __approveAssetMaxAsNeeded({
            _asset: address(principalToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: withdrawalAmount
        });

        (IPendleV2StandardizedYield syToken,, address yieldTokenAddress) = IPendleV2Market(market).readTokens();

        // Convert PT to SY
        // We can safely pass 0 as _minSyOut because we validate the final minIncomingAmount
        uint256 netSyOut;
        if (principalToken.isExpired()) {
            netSyOut = PENDLE_ROUTER.redeemPyToSy({
                _receiver: address(this),
                _YT: yieldTokenAddress,
                _netPyIn: withdrawalAmount,
                _minSyOut: 0
            });
        } else {
            // Unused since we do not need to perform a limit order.
            IPendleV2Router.LimitOrderData memory limit;

            (netSyOut,) = PENDLE_ROUTER.swapExactPtForSy({
                _receiver: address(this),
                _market: address(market),
                _exactPtIn: withdrawalAmount,
                _minSyOut: 0,
                _limit: limit
            });
        }

        __redeemSYToken({
            _minIncomingAmount: minIncomingAmount,
            _syToken: syToken,
            _withdrawalTokenAddress: withdrawalTokenAddress,
            _syTokenAmount: netSyOut,
            _receiver: msg.sender
        });

        if (IERC20(address(principalToken)).balanceOf(address(this)) == 0) {
            // Remove the principal token from storage
            // Also clears the mapping to enable its use in verifying storage presence
            principalTokens.removeStorageItem(address(principalToken));
            principalTokenToMarket[address(principalToken)] = address(0);

            emit PrincipalTokenRemoved(address(principalToken));
        }
    }

    /// @dev Helper to add liquidity to a Pendle market
    function __addLiquidity(bytes memory _actionArgs) private {
        // Decode the actionArgs
        (
            IPendleV2Market market,
            uint32 pricingDuration,
            address depositTokenAddress,
            uint256 depositAmount,
            IPendleV2Router.ApproxParams memory guessPtReceived,
            uint256 minLpOut
        ) = __decodeAddLiquidityActionArgs(_actionArgs);

        __handleMarketAndDurationInput({_marketAddress: address(market), _duration: pricingDuration});

        (IPendleV2StandardizedYield syToken,,) = market.readTokens();

        // We can safely pass in 0 for minIncomingShares since we validate the final minLpOut.
        uint256 syTokenAmount = __mintSYToken({
            _syToken: syToken,
            _depositTokenAddress: depositTokenAddress,
            _depositAmount: depositAmount,
            _minIncomingShares: 0,
            _receiver: address(this)
        });

        // Approve the market to spend the token
        __approveAssetMaxAsNeeded({
            _asset: address(syToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: syTokenAmount
        });

        // Unused since we do not need to perform a limit order.
        IPendleV2Router.LimitOrderData memory limit;

        // Add liquidity to the market
        PENDLE_ROUTER.addLiquiditySingleSy({
            _receiver: address(this),
            _market: address(market),
            _netSyIn: syTokenAmount,
            _minLpOut: minLpOut,
            _guessPtReceivedFromSy: guessPtReceived,
            _limit: limit
        });

        // Add the LP Token to storage if not already present
        if (!lpTokens.contains(address(market))) {
            lpTokens.push(address(market));
            emit LpTokenAdded(address(market));
        }
    }

    /// @dev Helper to remove liquidity from a Pendle market
    function __removeLiquidity(bytes memory _actionArgs) private {
        // Decode the actionArgs
        (
            IPendleV2Market market,
            address withdrawalToken,
            uint256 withdrawalAmount,
            uint256 minSyOut,
            uint256 minIncomingAmount
        ) = __decodeRemoveLiquidityActionArgs(_actionArgs);

        __validatePendleMarket(market);

        // Approve the router to spend the LP token
        __approveAssetMaxAsNeeded({
            _asset: address(market),
            _target: address(PENDLE_ROUTER),
            _neededAmount: withdrawalAmount
        });

        // Unused since we do not need to perform a limit order.
        IPendleV2Router.LimitOrderData memory limit;

        // Remove liquidity
        (uint256 syTokenAmount,) = PENDLE_ROUTER.removeLiquiditySingleSy({
            _receiver: address(this),
            _market: address(market),
            _netLpToRemove: withdrawalAmount,
            _minSyOut: minSyOut,
            _limit: limit
        });

        (IPendleV2StandardizedYield syToken,,) = market.readTokens();

        __redeemSYToken({
            _minIncomingAmount: minIncomingAmount,
            _syToken: syToken,
            _withdrawalTokenAddress: withdrawalToken,
            _syTokenAmount: syTokenAmount,
            _receiver: msg.sender
        });

        if (IERC20(address(market)).balanceOf(address(this)) == 0) {
            // If the LP token balance is 0, remove the LP token from storage
            lpTokens.removeStorageItem(address(market));
            emit LpTokenRemoved(address(market));
        }
    }

    /// @dev Helper to claim rewards from a Pendle market
    function __claimRewards(bytes memory _actionArgs) private {
        address[] memory marketAddresses = __decodeClaimRewardsActionArgs(_actionArgs);

        address[] memory rewardTokenAddresses;

        for (uint256 i; i < marketAddresses.length; i++) {
            IPendleV2Market market = IPendleV2Market(marketAddresses[i]);

            // Claim rewards
            rewardTokenAddresses = rewardTokenAddresses.mergeArray(market.getRewardTokens());
            market.redeemRewards(address(this));
        }

        // Send the rewards back to the vault.
        __pushFullAssetBalances(msg.sender, rewardTokenAddresses);
    }

    /// @dev Helper to handle market and duration input
    function __handleMarketAndDurationInput(address _marketAddress, uint32 _duration) private {
        // Check whether or not the market is already in storage.
        // If market is in storage, make sure that the provided duration matches the stored duration.
        uint32 storedDuration = getOraclePricingDurationForMarket(_marketAddress);

        if (storedDuration != 0) {
            require(storedDuration == _duration, "__handleMarketAndDurationInput: stored duration mismatch");
        } else {
            // If market is not in storage, validate market/duration and add it to storage.
            __validateMarketAndDuration({_marketAddress: _marketAddress, _duration: _duration});

            marketToOraclePricingDuration[_marketAddress] = _duration;
            emit OracleDurationForMarketAdded(_marketAddress, _duration);
        }
    }

    /// @dev Helper to handle principal token input
    function __handlePrincipalTokenInput(address _principalTokenAddress, address _marketAddress) private {
        // Check whether or not the principalToken is already in storage.
        // If PT is in storage, make sure that the provided config matches the stored config.
        address storedMarket = getMarketForPrincipalToken(_principalTokenAddress);

        if (storedMarket != address(0)) {
            require(storedMarket == _marketAddress, "__handlePrincipalTokenInput: stored market address mismatch");
        } else {
            // If PT is not in storage, validate that it matches the Pendle market.
            (, IPendleV2PrincipalToken retrievedPrincipalToken,) = IPendleV2Market(_marketAddress).readTokens();
            require(
                address(retrievedPrincipalToken) == _principalTokenAddress,
                "__handlePrincipalTokenInput: principal token and market mismatch"
            );

            principalTokens.push(_principalTokenAddress);
            principalTokenToMarket[_principalTokenAddress] = _marketAddress;
            emit PrincipalTokenAdded(_principalTokenAddress, _marketAddress);
        }
    }

    /// @dev Helper to mint a Pendle SY token from a depositToken
    function __mintSYToken(
        IPendleV2StandardizedYield _syToken,
        address _depositTokenAddress,
        uint256 _depositAmount,
        uint256 _minIncomingShares,
        address _receiver
    ) private returns (uint256 syTokenAmount_) {
        // Deposit the underlying token into the SY token
        uint256 nativeAssetDepositValue;
        address tokenIn = __parseNativeAssetInput(_depositTokenAddress);
        if (tokenIn == PENDLE_NATIVE_ASSET_ADDRESS) {
            // If depositTokenAddress is the native token, we need to unwrap the WETH pulled from the vault.
            WRAPPED_NATIVE_ASSET.withdraw(_depositAmount);
            nativeAssetDepositValue = _depositAmount;
        } else {
            __approveAssetMaxAsNeeded({_asset: tokenIn, _target: address(_syToken), _neededAmount: _depositAmount});
        }

        syTokenAmount_ = _syToken.deposit{value: nativeAssetDepositValue}({
            _receiver: _receiver,
            _tokenIn: tokenIn,
            _amountTokenToDeposit: _depositAmount,
            _minSharesOut: _minIncomingShares
        });

        return syTokenAmount_;
    }

    /// @dev Helper to parse the native asset address into the pendle native asset address as needed
    function __parseNativeAssetInput(address _assetAddress) private pure returns (address parsedAssetAddress_) {
        return _assetAddress == NATIVE_ASSET_ADDRESS ? PENDLE_NATIVE_ASSET_ADDRESS : _assetAddress;
    }

    /// @dev Helper to redeem a Pendle SY token into a withdrawalToken
    function __redeemSYToken(
        uint256 _minIncomingAmount,
        IPendleV2StandardizedYield _syToken,
        address _withdrawalTokenAddress,
        uint256 _syTokenAmount,
        address _receiver
    ) private {
        address tokenOut = __parseNativeAssetInput(_withdrawalTokenAddress);

        // Redeem the SY token
        _syToken.redeem({
            _receiver: _receiver,
            _amountSharesToRedeem: _syTokenAmount,
            _tokenOut: tokenOut,
            _minTokenOut: _minIncomingAmount,
            _burnFromInternalBalance: false
        });
    }

    /// @dev Helper to validate the market and duration
    /// Throws if invalid
    function __validateMarketAndDuration(address _marketAddress, uint32 _duration) private view {
        __validatePendleMarket({_market: IPendleV2Market(_marketAddress)});

        // For safety, we require that the specified duration falls between some boundaries.
        require(
            MINIMUM_PRICING_DURATION <= _duration && _duration <= MAXIMUM_PRICING_DURATION,
            "__validateMarketAndDuration: out-of-bounds duration"
        );

        // We validate that the oracle duration is valid as recommended by the Pendle docs.
        // src: https://docs.pendle.finance/Developers/Integration/PTOracle#oracle-preparation
        (bool increaseCardinalityRequired,, bool oldestObservationSatisfied) =
            PRINCIPAL_TOKEN_ORACLE.getOracleState({_market: _marketAddress, _duration: _duration});
        require(
            increaseCardinalityRequired == false && oldestObservationSatisfied == true,
            "__validateMarketAndDuration: invalid pricing duration"
        );
    }

    /// @dev Helper to validate that the market is a canonical Pendle market
    /// Also checks that the market's rate asset is in the list of supported assets
    /// Throws if invalid
    function __validatePendleMarket(IPendleV2Market _market) private view {
        IPendleV2MarketFactory pendleMarketFactory = IPendleV2MarketFactory(_market.factory());

        require(
            ADDRESS_LIST_REGISTRY.isInList(PENDLE_MARKET_FACTORIES_LIST_ID, address(pendleMarketFactory)),
            "__validatePendleMarket: invalid market factory"
        );

        require(
            pendleMarketFactory.isValidMarket({_market: address(_market)}),
            "__validatePendleMarket: invalid market address"
        );
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    // CONSIDERATIONS FOR FUND MANAGERS:
    // 1. The pricing of Pendle Principal Tokens and LP tokens is TWAP-based.
    //    Managers can specify which on-chain market and duration they want to use for pricing.
    //    The market and duration is stored in the EP. Once set, a market/duration pair cannot be changed.
    //    For more information on Pendle Principal Tokens pricing, see https://docs.pendle.finance/Developers/Integration/PTOracle
    //    For more information on Pendle LP Tokens pricing, see https://docs.pendle.finance/Developers/Integration/LPOracle
    // 2. The valuation of the External Positions fully excludes accrued rewards.
    //    To prevent significant underpricing, managers should claim rewards regularly.

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 2 ways that value can be contributed to this position
    /// 1. Principal token (PT) holdings
    /// 2. LP token holdings
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        address[] memory principalTokensMem = principalTokens;
        uint256 principalTokensLength = principalTokensMem.length;

        address[] memory lpTokensMem = lpTokens;
        uint256 lpTokensLength = lpTokensMem.length;

        // If no principalTokens and no lpTokens are stored, return empty arrays.
        if (principalTokensLength == 0 && lpTokensLength == 0) {
            return (assets_, amounts_);
        }

        address[] memory rawAssets = new address[](principalTokensLength + lpTokensLength);
        uint256[] memory rawAmounts = new uint256[](principalTokensLength + lpTokensLength);

        for (uint256 i; i < principalTokensLength; i++) {
            (rawAssets[i], rawAmounts[i]) = __getPrincipalTokenValue(principalTokensMem[i]);
        }

        for (uint256 i; i < lpTokensLength; i++) {
            // Start assigning from the subarray that follows the assigned principalTokens
            uint256 nextEmptyIndex = principalTokensLength + i;
            (rawAssets[nextEmptyIndex], rawAmounts[nextEmptyIndex]) = __getLpTokenValue(lpTokensMem[i]);
        }

        // Does not remove 0-amount items
        (assets_, amounts_) = __aggregateAssetAmounts(rawAssets, rawAmounts);
    }

    /// @dev Helper to get the value, in the underlying asset, of a lpToken holding
    function __getLpTokenValue(address _lpTokenAddress)
        private
        view
        returns (address underlyingToken_, uint256 value_)
    {
        uint256 lpTokenBalance = IERC20(_lpTokenAddress).balanceOf(address(this));

        // Get the underlying token address
        (IPendleV2StandardizedYield syToken,,) = IPendleV2Market(_lpTokenAddress).readTokens();
        (, underlyingToken_,) = syToken.assetInfo();

        // If underlying is the native asset, replace with the wrapped native asset for pricing purposes
        if (underlyingToken_ == PENDLE_NATIVE_ASSET_ADDRESS) {
            underlyingToken_ = address(WRAPPED_NATIVE_ASSET);
        }

        uint256 rate = PendleLpOracleLib.getLpToAssetRate({
            market: IOracleLibPendleMarket(_lpTokenAddress),
            duration: getOraclePricingDurationForMarket(_lpTokenAddress)
        });

        value_ = lpTokenBalance * rate / ORACLE_RATE_PRECISION;
    }

    /// @dev Helper to get the value, in the underlying asset, of a principal token holding
    function __getPrincipalTokenValue(address _principalTokenAddress)
        private
        view
        returns (address underlyingToken_, uint256 value_)
    {
        uint256 principalTokenBalance = IERC20(_principalTokenAddress).balanceOf(address(this));

        // Get the underlying token address
        (, underlyingToken_,) =
            IPendleV2StandardizedYield(IPendleV2PrincipalToken(_principalTokenAddress).SY()).assetInfo();

        // If underlying is the native asset, replace with the wrapped native asset for pricing purposes
        if (underlyingToken_ == PENDLE_NATIVE_ASSET_ADDRESS) {
            underlyingToken_ = address(WRAPPED_NATIVE_ASSET);
        }

        // Retrieve the stored market and its duration
        IOracleLibPendleMarket market = IOracleLibPendleMarket(getMarketForPrincipalToken(_principalTokenAddress));

        uint256 rate = PendlePtOracleLib.getPtToAssetRate({
            market: market,
            duration: getOraclePricingDurationForMarket(address(market))
        });

        value_ = principalTokenBalance * rate / ORACLE_RATE_PRECISION;

        return (underlyingToken_, value_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the LP Tokens held
    /// @return lpTokenAddresses_ The Pendle LPToken addresses
    function getLPTokens() public view override returns (address[] memory lpTokenAddresses_) {
        return lpTokens;
    }

    /// @notice Gets the market used for pricing a particular Principal Token
    /// @param _principalTokenAddress The Principal token address
    /// @return marketAddress_ The market address for a Pendle principal token address
    function getMarketForPrincipalToken(address _principalTokenAddress)
        public
        view
        override
        returns (address marketAddress_)
    {
        return principalTokenToMarket[_principalTokenAddress];
    }

    /// @notice Gets the oracle duration for pricing tokens of a particular Pendle market
    /// @param _marketAddress The address of the Pendle market
    /// @return pricingDuration_ The oracle duration
    function getOraclePricingDurationForMarket(address _marketAddress)
        public
        view
        override
        returns (uint32 pricingDuration_)
    {
        return marketToOraclePricingDuration[_marketAddress];
    }

    /// @notice Gets the Principal Tokens held
    /// @return principalTokenAddresses_ The Pendle Principal token addresses
    function getPrincipalTokens() public view override returns (address[] memory principalTokenAddresses_) {
        return principalTokens;
    }
}

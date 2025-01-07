// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IPendleV2Market} from "../../../../../external-interfaces/IPendleV2Market.sol";
import {IPendleV2PrincipalToken} from "../../../../../external-interfaces/IPendleV2PrincipalToken.sol";
import {IPendleV2PyYtLpOracle} from "../../../../../external-interfaces/IPendleV2PyYtLpOracle.sol";
import {IPendleV2Router} from "../../../../../external-interfaces/IPendleV2Router.sol";
import {IPendleV2StandardizedYield} from "../../../../../external-interfaces/IPendleV2StandardizedYield.sol";
import {IWETH} from "../../../../../external-interfaces/IWETH.sol";
import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {IExternalPositionProxy} from "../../../../../persistent/external-positions/IExternalPositionProxy.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.8.19/open-zeppelin/WrappedSafeERC20.sol";
import {PendleV2PositionLibBase1} from "./bases/PendleV2PositionLibBase1.sol";
import {IPendleV2MarketRegistry} from "./markets-registry/IPendleV2MarketRegistry.sol";
import {IPendleV2Position} from "./IPendleV2Position.sol";
import {PendleV2PositionDataDecoder} from "./PendleV2PositionDataDecoder.sol";

/// @title PendleV2PositionLib Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice An External Position library contract for Pendle V2 Positions
/// @dev In order to take a particular Pendle V2 position (PT or LP),
/// the fund owner must first register it on the PendleV2MarketsRegistry contract, via the VaultProxy,
/// i.e., by calling ComptrollerProxy.vaultCallOnContract().
/// The actions allowed in this position follow the following rules based on the registry:
///   - Can buy PT from MarketA: MarketA is the market oracle for PT
///   - Can sell PT on MarketA: MarketA is the market oracle for PT
///   - Can provide liquidity to MarketA: MarketA has a non-zero TWAP duration
///   - Can remove liquidity from MarketA: always allowed if LP token was acquired via this contract
/// See "POSITION VALUE" section for notes on pricing mechanism that must be considered by funds.
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
    IPendleV2MarketRegistry internal immutable PENDLE_MARKET_REGISTRY;
    IPendleV2PyYtLpOracle internal immutable PENDLE_ORACLE;
    uint256 internal immutable PENDLE_PEGGED_SY_TOKENS_LIST_ID;
    IPendleV2Router internal immutable PENDLE_ROUTER;
    IWETH private immutable WRAPPED_NATIVE_ASSET;

    constructor(
        address _addressListRegistryAddress,
        address _pendleMarketsRegistryAddress,
        address _pendleOracleAddress,
        uint256 _pendlePeggedSyTokensListId,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    ) {
        ADDRESS_LIST_REGISTRY = IAddressListRegistry(_addressListRegistryAddress);
        PENDLE_MARKET_REGISTRY = IPendleV2MarketRegistry(_pendleMarketsRegistryAddress);
        PENDLE_ORACLE = IPendleV2PyYtLpOracle(_pendleOracleAddress);
        PENDLE_PEGGED_SY_TOKENS_LIST_ID = _pendlePeggedSyTokensListId;
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
        } else if (actionId == uint256(Actions.MigrateToVault)) {
            __migrateToVault();
        }
    }

    /// @dev Helper to buy a Pendle principal token from an underlying token
    function __buyPrincipalToken(bytes memory _actionArgs) private {
        // Decode the actionArgs
        (
            IPendleV2Market market,
            address depositTokenAddress,
            uint256 depositAmount,
            IPendleV2Router.ApproxParams memory guessPtOut,
            uint256 minPtOut
        ) = __decodeBuyPrincipalTokenActionArgs(_actionArgs);

        (IPendleV2StandardizedYield syToken, IPendleV2PrincipalToken principalToken,) = market.readTokens();

        __validateMarketForPt({_ptAddress: address(principalToken), _marketAddress: address(market)});

        // Add principal token to storage as-needed
        if (!principalTokens.contains(address(principalToken))) {
            principalTokens.push(address(principalToken));
            emit PrincipalTokenAdded(address(principalToken));
        }

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
        (IPendleV2Market market, address withdrawalTokenAddress, uint256 withdrawalAmount, uint256 minIncomingAmount) =
            __decodeSellPrincipalTokenActionArgs(_actionArgs);

        (IPendleV2StandardizedYield syToken, IPendleV2PrincipalToken principalToken, address yieldTokenAddress) =
            IPendleV2Market(market).readTokens();

        __validateMarketForPt({_ptAddress: address(principalToken), _marketAddress: address(market)});

        // Approve the principal token to be spent by the market
        __approveAssetMaxAsNeeded({
            _asset: address(principalToken),
            _target: address(PENDLE_ROUTER),
            _neededAmount: withdrawalAmount
        });

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
            // Remove the principal token from storage if no balance remains
            principalTokens.removeStorageItem(address(principalToken));

            emit PrincipalTokenRemoved(address(principalToken));
        }
    }

    /// @dev Helper to add liquidity to a Pendle market
    function __addLiquidity(bytes memory _actionArgs) private {
        // Decode the actionArgs
        (
            IPendleV2Market market,
            address depositTokenAddress,
            uint256 depositAmount,
            IPendleV2Router.ApproxParams memory guessPtReceived,
            uint256 minLpOut
        ) = __decodeAddLiquidityActionArgs(_actionArgs);

        // Validate that the market has a non-zero duration (i.e, is registered)
        require(
            PENDLE_MARKET_REGISTRY.getMarketOracleDurationForUser({_user: msg.sender, _marketAddress: address(market)})
                > 0,
            "__addLiquidity: Unsupported market"
        );

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

        // Validate that the LP token is tracked in this position (i.e., was acquired via this contract)
        require(lpTokens.contains(address(market)), "__removeLiquidity: Unsupported market");

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
        // Ignore any PT and LP tokens held by this contract, as a precaution.
        for (uint256 i; i < rewardTokenAddresses.length; i++) {
            IERC20 rewardToken = IERC20(rewardTokenAddresses[i]);
            uint256 rewardTokenBalance = rewardToken.balanceOf(address(this));

            if (
                rewardTokenBalance == 0 || principalTokens.contains(address(rewardToken))
                    || lpTokens.contains(address(rewardToken))
            ) {
                continue;
            }

            rewardToken.safeTransfer(msg.sender, rewardTokenBalance);
        }
    }

    /// @dev Helper to migrate all PTs and LPs to the vault (i.e., shut down this external position)
    function __migrateToVault() private {
        address[] memory ptsToTransfer = getPrincipalTokens();
        address[] memory lpTokensToTransfer = getLPTokens();

        delete principalTokens;
        delete lpTokens;

        __pushFullAssetBalances({_target: msg.sender, _assets: ptsToTransfer});
        __pushFullAssetBalances({_target: msg.sender, _assets: lpTokensToTransfer});

        emit MigratedToVault();
    }

    /// @dev Helper to mint a Pendle SY token from a depositToken
    function __mintSYToken(
        IPendleV2StandardizedYield _syToken,
        address _depositTokenAddress,
        uint256 _depositAmount,
        uint256 _minIncomingShares,
        address _receiver
    ) private returns (uint256 syTokenAmount_) {
        __validateSyToken({_syTokenAddress: address(_syToken)});

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

    /// @dev Helper to validate the market a PT can be traded on
    function __validateMarketForPt(address _ptAddress, address _marketAddress) private view {
        require(
            _marketAddress
                == PENDLE_MARKET_REGISTRY.getPtOracleMarketForUser({_user: msg.sender, _ptAddress: _ptAddress}),
            "__validateMarketForPt: Unsupported market"
        );
    }

    /// @dev Helper to validate whether a SY Token is allowed
    function __validateSyToken(address _syTokenAddress) private view {
        require(
            ADDRESS_LIST_REGISTRY.isInList(PENDLE_PEGGED_SY_TOKENS_LIST_ID, _syTokenAddress),
            "__validateSyToken: Unsupported SY Token"
        );
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    // CONSIDERATIONS FOR FUND MANAGERS:
    // 1. The pricing of Pendle Principal Tokens and LP tokens is TWAP-based.
    //    Fund owners provide the TWAP duration to use for each position, via a registry contract (see contract-level natspec).
    //    Position pricing security and correctness will vary according to market liquidity and TWAP duration.
    //    Fund owners must consider these factors along with their fund's risk tolerance for share price deviations.
    //    For more information on Pendle Principal Tokens pricing, see https://docs.pendle.finance/Developers/Oracles/IntroductionOfPtOracle
    //    For more information on Pendle LP Tokens pricing, see https://docs.pendle.finance/Developers/Oracles/IntroductionOfLpOracle
    // 2. The valuation of the External Positions fully excludes accrued rewards.
    //    To prevent significant underpricing, managers should claim rewards regularly.
    // 3. Principal Tokens and LP Tokens are priced in Pendle StandardizedYield (SY) Tokens, which are then converted to the underlying yield asset.
    //    It is assumed that the SY Token will always be 1:1 redeemable for the underlying yield asset.
    //    The Enzyme technical council maintains an onchain list of theses SY Tokens.
    //    If a SY Token is held by the position but is not part of the list, pricing will revert.
    //    For the Pendle-maintained list of pegged SY Tokens, see https://docs.pendle.finance/Developers/Contracts/StandardizedYield

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
        address vaultProxyAddress = IExternalPositionProxy(address(this)).getVaultProxy();

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
            (rawAssets[i], rawAmounts[i]) = __getPrincipalTokenValue({
                _vaultProxyAddress: vaultProxyAddress,
                _principalTokenAddress: principalTokensMem[i]
            });
        }

        for (uint256 i; i < lpTokensLength; i++) {
            // Start assigning from the subarray that follows the assigned principalTokens
            uint256 nextEmptyIndex = principalTokensLength + i;
            (rawAssets[nextEmptyIndex], rawAmounts[nextEmptyIndex]) =
                __getLpTokenValue({_vaultProxyAddress: vaultProxyAddress, _lpTokenAddress: lpTokensMem[i]});
        }

        // Does not remove 0-amount items
        (assets_, amounts_) = __aggregateAssetAmounts(rawAssets, rawAmounts);
    }

    /// @dev Helper to get the value, in the underlying asset, of a lpToken holding
    function __getLpTokenValue(address _vaultProxyAddress, address _lpTokenAddress)
        private
        view
        returns (address underlyingToken_, uint256 value_)
    {
        uint256 lpTokenBalance = IERC20(_lpTokenAddress).balanceOf(address(this));

        // Get the underlying token address
        (IPendleV2StandardizedYield syToken,,) = IPendleV2Market(_lpTokenAddress).readTokens();

        __validateSyToken({_syTokenAddress: address(syToken)});

        underlyingToken_ = syToken.yieldToken();

        // Retrieve the registered oracle duration for the market
        uint32 duration = PENDLE_MARKET_REGISTRY.getMarketOracleDurationForUser({
            _user: _vaultProxyAddress,
            _marketAddress: _lpTokenAddress
        });
        require(duration > 0, "__getLpTokenValue: Duration not registered");

        uint256 rate = PENDLE_ORACLE.getLpToSyRate({_market: _lpTokenAddress, _duration: duration});

        // We always assume 1:1 SYToken:YieldToken redeemability
        value_ = lpTokenBalance * rate / ORACLE_RATE_PRECISION;

        // If underlying is the native asset, replace with the wrapped native asset for pricing purposes
        if (underlyingToken_ == PENDLE_NATIVE_ASSET_ADDRESS) {
            underlyingToken_ = address(WRAPPED_NATIVE_ASSET);
        }
    }

    /// @dev Helper to get the value, in the underlying asset, of a principal token holding
    function __getPrincipalTokenValue(address _vaultProxyAddress, address _principalTokenAddress)
        private
        view
        returns (address underlyingToken_, uint256 value_)
    {
        uint256 principalTokenBalance = IERC20(_principalTokenAddress).balanceOf(address(this));

        // Get the underlying token address
        IPendleV2StandardizedYield syToken =
            IPendleV2StandardizedYield(IPendleV2PrincipalToken(_principalTokenAddress).SY());

        __validateSyToken({_syTokenAddress: address(syToken)});

        underlyingToken_ = syToken.yieldToken();

        // Retrieve the registered oracle market and its duration
        (address marketAddress, uint32 duration) = PENDLE_MARKET_REGISTRY.getPtOracleMarketAndDurationForUser({
            _ptAddress: _principalTokenAddress,
            _user: _vaultProxyAddress
        });
        require(duration > 0, "__getPrincipalTokenValue: Duration not registered");

        uint256 rate = PENDLE_ORACLE.getPtToSyRate({
            _market: marketAddress,
            _duration: PENDLE_MARKET_REGISTRY.getMarketOracleDurationForUser({
                _user: _vaultProxyAddress,
                _marketAddress: marketAddress
            })
        });

        // We always assume 1:1 SYToken:YieldToken redeemability
        value_ = principalTokenBalance * rate / ORACLE_RATE_PRECISION;

        // If underlying is the native asset, replace with the wrapped native asset for pricing purposes
        if (underlyingToken_ == PENDLE_NATIVE_ASSET_ADDRESS) {
            underlyingToken_ = address(WRAPPED_NATIVE_ASSET);
        }

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

    /// @notice Gets the Principal Tokens held
    /// @return principalTokenAddresses_ The Pendle Principal token addresses
    function getPrincipalTokens() public view override returns (address[] memory principalTokenAddresses_) {
        return principalTokens;
    }
}

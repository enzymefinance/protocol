// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IBalancerV2Vault} from "../../../../../../../external-interfaces/IBalancerV2Vault.sol";
import {IERC20} from "../../../../../../../external-interfaces/IERC20.sol";
import {AddressArrayLib} from "../../../../../../../utils/0.6.12/AddressArrayLib.sol";
import {IIntegrationManager} from "../../../../IIntegrationManager.sol";
import {BalancerV2ActionsMixin} from "../actions/BalancerV2ActionsMixin.sol";
import {AdapterBase} from "../AdapterBase.sol";

/// @title BalancerV2LiquidityAdapterBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base adapter for liquidity provision in Balancer V2 pools.
/// Implementing contracts can allow staking via Balancer gauges, Aura, etc.
/// @dev Rewards tokens are not included as incoming assets for claimRewards()
abstract contract BalancerV2LiquidityAdapterBase is AdapterBase, BalancerV2ActionsMixin {
    using AddressArrayLib for address[];

    constructor(address _integrationManager, address _balancerVault)
        public
        AdapterBase(_integrationManager)
        BalancerV2ActionsMixin(_balancerVault)
    {}

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to claim rewards for a given staking token
    function __claimRewards(address _vaultProxy, address _stakingToken) internal virtual;

    /// @dev Logic to get the BPT address for a given staking token.
    /// Implementations should pre-validate whether the staking token is valid,
    /// when reasonable.
    function __getBptForStakingToken(address _stakingToken) internal view virtual returns (address bpt_);

    /// @dev Logic to stake BPT to a given staking token.
    /// Staking is always the last action and thus always sent to the _vaultProxy
    /// (rather than a more generically-named `_recipient`).
    function __stake(address _vaultProxy, address _stakingToken, uint256 _bptAmount) internal virtual;

    /// @dev Logic to unstake BPT from a given staking token
    function __unstake(address _from, address _recipient, address _stakingToken, uint256 _bptAmount) internal virtual;

    /////////////
    // ACTIONS //
    /////////////

    // EXTERNAL FUNCTIONS

    /// @notice Claims all rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @dev Needs `onlyIntegrationManager` because Minter claiming permission is given by the fund
    function claimRewards(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        __claimRewards(_vaultProxy, __decodeClaimRewardsCallArgs(_actionData));
    }

    /// @notice Lends assets for LP tokens, then stakes the received LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function lendAndStake(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (
            address stakingToken,
            bytes32 poolId,
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeCombinedActionCallArgs(_actionData);

        __lend(address(this), poolId, spendAssets, spendAssetAmounts, request);

        __stake(_vaultProxy, stakingToken, IERC20(__parseBalancerPoolAddress(poolId)).balanceOf(address(this)));

        // There can be different join/exit options per Balancer pool type,
        // some of which involve spending only up-to-max amounts
        __pushFullAssetBalances(_vaultProxy, spendAssets);
    }

    /// @notice Stakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function stake(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(_actionData);

        __stake(_vaultProxy, stakingToken, bptAmount);
    }

    /// @notice Swaps assets on Balancer via batchSwap()
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @dev All `_actionData` inputs are Balancer `batchSwap()` params, with the exception of `stakingTokens`.
    /// "Spend assets" and "incoming assets" are parsed from the `limits` values corresponding to `assets`:
    /// - limit > 0 is a spend asset
    /// - limit < 0 is an incoming asset (including a partially-consumed intermediary asset)
    /// - limit == 0 is an intermediary asset that is completely consumed in the swap
    /// This function can also used for "LPing" with ComposableStablePool instances,
    /// since those pools contain their own BPT as an underlying asset.
    /// `stakingTokens` facilitates "lend and stake" and "unstake and redeem"-like functionality for such pools.
    /// If `stakingTokens[i]` is non-empty, it is considered to be the actual spend/incoming asset
    /// that must be unstaked to / staked from the BPT specified in `assets[i]` before/after the batchSawp().
    function takeOrder(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (
            IBalancerV2Vault.SwapKind kind,
            IBalancerV2Vault.BatchSwapStep[] memory swaps,
            address[] memory assets,
            int256[] memory limits,
            address[] memory stakingTokens
        ) = __decodeTakeOrderCallArgs(_actionData);

        // Pre-process spend and incoming assets
        bool hasIncomingStakedBpt;
        uint256 assetCount = assets.length;
        for (uint256 i; i < assetCount; i++) {
            if (limits[i] > 0) {
                uint256 spendAssetAmount = uint256(limits[i]);

                // Unstake BPT
                if (stakingTokens[i] != address(0)) {
                    __unstake({
                        _from: address(this),
                        _recipient: address(this),
                        _stakingToken: stakingTokens[i],
                        _bptAmount: spendAssetAmount
                    });
                }

                // Grant allowances
                __approveAssetMaxAsNeeded({
                    _asset: assets[i],
                    _target: address(BALANCER_VAULT_CONTRACT),
                    _neededAmount: spendAssetAmount
                });
            } else if (limits[i] < 0 && stakingTokens[i] != address(0)) {
                hasIncomingStakedBpt = true;
            }
        }

        // Execute batch swap
        int256[] memory assetDeltas = __balancerV2BatchSwap({
            _sender: address(this),
            _recipient: hasIncomingStakedBpt ? address(this) : _vaultProxy,
            _kind: kind,
            _swaps: swaps,
            _assets: assets,
            _limits: limits
        });

        // Post-process spend and incoming assets
        for (uint256 i; i < assetCount; i++) {
            if (limits[i] > 0) {
                // Re-stake any unused BPT,
                // only if partial spend was intentional due to specifying exact swap output amounts.
                // Prevents griefing edge case if `__stake()` reverts.
                if (stakingTokens[i] != address(0) && kind == IBalancerV2Vault.SwapKind.GIVEN_OUT) {
                    uint256 bptAmount = IERC20(assets[i]).balanceOf(address(this));
                    if (bptAmount > 0) {
                        __stake({_vaultProxy: _vaultProxy, _stakingToken: stakingTokens[i], _bptAmount: bptAmount});
                    }
                }

                // Push any remaining spend asset balance back to the vault
                __pushFullAssetBalance({_target: _vaultProxy, _asset: assets[i]});
            } else if (limits[i] < 0) {
                if (stakingTokens[i] != address(0)) {
                    __stake({
                        _vaultProxy: _vaultProxy,
                        _stakingToken: stakingTokens[i],
                        _bptAmount: IERC20(assets[i]).balanceOf(address(this))
                    });
                } else if (hasIncomingStakedBpt) {
                    // Push any remaining incoming asset balance back to the vault
                    __pushFullAssetBalance({_target: _vaultProxy, _asset: assets[i]});
                }
            } else {
                // Validate no leftover balance for assets assumed to be purely intermediary
                require(assetDeltas[i] == 0, "takeOrder: leftover intermediary");
            }
        }
    }

    /// @notice Unstakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unstake(address _vaultProxy, bytes calldata _actionData, bytes calldata) external onlyIntegrationManager {
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(_actionData);

        __unstake(_vaultProxy, _vaultProxy, stakingToken, bptAmount);
    }

    /// @notice Unstakes LP tokens, then redeems them
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unstakeAndRedeem(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (
            address stakingToken,
            bytes32 poolId,
            uint256 bptAmount,
            address[] memory expectedIncomingTokens,
            ,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeCombinedActionCallArgs(_actionData);

        __unstake(_vaultProxy, address(this), stakingToken, bptAmount);

        __redeem(_vaultProxy, poolId, bptAmount, expectedIncomingTokens, request);

        // The full amount of unstaked bpt might not be used in a redemption for exact underlyings
        // (with max bpt specified). In that case, re-stake the unused bpt.
        address bpt = __parseBalancerPoolAddress(poolId);
        uint256 remainingBpt = IERC20(bpt).balanceOf(address(this));
        if (remainingBpt > 0) {
            __stake(_vaultProxy, stakingToken, remainingBpt);
        }

        // The full amount of staked bpt will always have been used
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to perform all logic to LP on Balancer
    function __lend(
        address _recipient,
        bytes32 _poolId,
        address[] memory _spendAssets,
        uint256[] memory _spendAssetAmounts,
        IBalancerV2Vault.PoolBalanceChange memory _request
    ) internal {
        for (uint256 i; i < _spendAssets.length; i++) {
            __approveAssetMaxAsNeeded(_spendAssets[i], address(BALANCER_VAULT_CONTRACT), _spendAssetAmounts[i]);
        }

        __balancerV2Lend(_poolId, address(this), _recipient, _request);
    }

    /// @dev Helper to perform all logic to redeem Balancer BPTs
    function __redeem(
        address _vaultProxy,
        bytes32 _poolId,
        uint256 _spendBptAmount,
        address[] memory _expectedIncomingTokens,
        IBalancerV2Vault.PoolBalanceChange memory _request
    ) internal {
        __approveAssetMaxAsNeeded(
            __parseBalancerPoolAddress(_poolId), address(BALANCER_VAULT_CONTRACT), _spendBptAmount
        );

        // Since we are not parsing request.userData, we do not know with certainty which tokens
        // will be received. We are relying on the user-input _expectedIncomingTokens up to this point.
        // But, to guarantee that no unexpected tokens are received, we need to monitor those balances.
        uint256 unusedTokensCount = _request.assets.length - _expectedIncomingTokens.length;
        uint256[] memory preTxTokenBalancesIfUnused;
        if (unusedTokensCount > 0) {
            preTxTokenBalancesIfUnused = new uint256[](_request.assets.length);
            uint256 remainingCount = unusedTokensCount;
            for (uint256 i; remainingCount > 0; i++) {
                if (!_expectedIncomingTokens.contains(_request.assets[i])) {
                    preTxTokenBalancesIfUnused[i] = IERC20(_request.assets[i]).balanceOf(_vaultProxy);
                    remainingCount--;
                }
            }
        }

        __balancerV2Redeem(_poolId, address(this), payable(_vaultProxy), _request);

        if (unusedTokensCount > 0) {
            for (uint256 i; unusedTokensCount > 0; i++) {
                if (!_expectedIncomingTokens.contains(_request.assets[i])) {
                    require(
                        IERC20(_request.assets[i]).balanceOf(_vaultProxy) == preTxTokenBalancesIfUnused[i],
                        "__balancerRedeem: Unexpected asset received"
                    );
                    unusedTokensCount--;
                }
            }
        }
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address, bytes4 _selector, bytes calldata _actionData)
        public
        view
        virtual
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == CLAIM_REWARDS_SELECTOR) {
            return __parseAssetsForClaimRewards();
        } else if (_selector == LEND_AND_STAKE_SELECTOR) {
            return __parseAssetsForLendAndStake(_actionData);
        } else if (_selector == UNSTAKE_AND_REDEEM_SELECTOR) {
            return __parseAssetsForUnstakeAndRedeem(_actionData);
        } else if (_selector == TAKE_ORDER_SELECTOR) {
            return __parseAssetsForTakeOrder(_actionData);
        } else if (_selector == STAKE_SELECTOR) {
            return __parseAssetsForStake(_actionData);
        } else if (_selector == UNSTAKE_SELECTOR) {
            return __parseAssetsForUnstake(_actionData);
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewards() calls.
    /// No action required, all values empty.
    function __parseAssetsForClaimRewards()
        internal
        pure
        virtual
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        return (
            IIntegrationManager.SpendAssetsHandleType.None,
            new address[](0),
            new uint256[](0),
            new address[](0),
            new uint256[](0)
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLendAndStake(bytes calldata _encodedCallArgs)
        internal
        view
        virtual
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        bytes32 poolId;
        address stakingToken;
        IBalancerV2Vault.PoolBalanceChange memory request;
        (stakingToken, poolId, minIncomingAssetAmounts_[0], spendAssets_, spendAssetAmounts_, request) =
            __decodeCombinedActionCallArgs(_encodedCallArgs);

        __validatePoolForStakingToken(stakingToken, poolId);
        __validateNoInternalBalances(request.useInternalBalance);

        incomingAssets_[0] = stakingToken;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during stake() calls
    function __parseAssetsForStake(bytes calldata _encodedCallArgs)
        internal
        view
        virtual
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        spendAssets_[0] = __getBptForStakingToken(stakingToken);
        spendAssetAmounts_[0] = bptAmount;

        incomingAssets_[0] = stakingToken;
        minIncomingAssetAmounts_[0] = bptAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during takeOrder() calls
    function __parseAssetsForTakeOrder(bytes calldata _encodedCallArgs)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (,, address[] memory assets, int256[] memory limits, address[] memory stakingTokens) =
            __decodeTakeOrderCallArgs(_encodedCallArgs);

        // See takeOrder() comments for how spend and incoming assets are parsed

        uint256 spendAssetsCount;
        uint256 incomingAssetsCount;
        for (uint256 i; i < assets.length; i++) {
            if (limits[i] > 0) {
                spendAssetsCount++;
            } else if (limits[i] < 0) {
                incomingAssetsCount++;
            }
        }

        spendAssets_ = new address[](spendAssetsCount);
        spendAssetAmounts_ = new uint256[](spendAssetsCount);

        incomingAssets_ = new address[](incomingAssetsCount);
        minIncomingAssetAmounts_ = new uint256[](incomingAssetsCount);

        for (uint256 i; i < assets.length; i++) {
            int256 limit = limits[i];

            if (limit > 0) {
                address spendAsset = assets[i];
                address stakingToken = stakingTokens[i];

                if (stakingToken != address(0)) {
                    require(
                        spendAsset == __getBptForStakingToken(stakingToken), "__parseAssetsForTakeOrder: BPT mismatch"
                    );
                    spendAsset = stakingToken;
                }

                spendAssetsCount--;
                spendAssets_[spendAssetsCount] = spendAsset;
                spendAssetAmounts_[spendAssetsCount] = uint256(limit);
            } else if (limit < 0) {
                address incomingAsset = assets[i];
                address stakingToken = stakingTokens[i];

                if (stakingToken != address(0)) {
                    require(
                        incomingAsset == __getBptForStakingToken(stakingToken),
                        "__parseAssetsForTakeOrder: BPT mismatch"
                    );
                    incomingAsset = stakingToken;
                }

                incomingAssetsCount--;
                incomingAssets_[incomingAssetsCount] = incomingAsset;
                minIncomingAssetAmounts_[incomingAssetsCount] = uint256(-limit);
            }
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during unstake() calls
    function __parseAssetsForUnstake(bytes calldata _encodedCallArgs)
        internal
        view
        virtual
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        spendAssets_[0] = stakingToken;
        spendAssetAmounts_[0] = bptAmount;

        incomingAssets_[0] = __getBptForStakingToken(stakingToken);
        minIncomingAssetAmounts_[0] = bptAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during unstakeAndRedeem() calls
    function __parseAssetsForUnstakeAndRedeem(bytes calldata _encodedCallArgs)
        internal
        view
        virtual
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);

        bytes32 poolId;
        address stakingToken;
        IBalancerV2Vault.PoolBalanceChange memory request;
        (stakingToken, poolId, spendAssetAmounts_[0], incomingAssets_, minIncomingAssetAmounts_, request) =
            __decodeCombinedActionCallArgs(_encodedCallArgs);

        __validatePoolForStakingToken(stakingToken, poolId);
        __validateNoInternalBalances(request.useInternalBalance);

        spendAssets_[0] = stakingToken;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper to get a Balancer pool address (i.e., Balancer Pool Token) for a given id.
    /// See: https://github.com/balancer-labs/balancer-v2-monorepo/blob/42906226223f29e4489975eb3c0d5014dea83b66/pkg/vault/contracts/PoolRegistry.sol#L130-L139
    function __parseBalancerPoolAddress(bytes32 _poolId) internal pure returns (address poolAddress_) {
        return address(uint256(_poolId) >> (12 * 8));
    }

    /// @dev Helper to validate a given poolId for a given staking token.
    /// Does not validate the staking token itself, unless handled in the implementing contract
    /// during __getBptForStakingToken().
    function __validatePoolForStakingToken(address _stakingToken, bytes32 _poolId) internal view {
        require(
            __getBptForStakingToken(_stakingToken) == __parseBalancerPoolAddress(_poolId),
            "__validateBptForStakingToken: Invalid"
        );
    }

    /// @dev Helper to validate Balancer internal balances are not used
    function __validateNoInternalBalances(bool _useInternalBalances) internal pure {
        require(!_useInternalBalances, "__validateNoInternalBalances: Invalid");
    }

    //////////////
    // DECODERS //
    //////////////

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCombinedActionCallArgs(bytes memory _encodedCallArgs)
        internal
        pure
        returns (
            address stakingToken_,
            bytes32 poolId_,
            uint256 bptAmount_,
            address[] memory usedTokens_, // only the assets that will actually be spent/received
            uint256[] memory usedTokenAmounts_, // only the assets that will actually be spent/received
            IBalancerV2Vault.PoolBalanceChange memory request_
        )
    {
        return abi.decode(
            _encodedCallArgs, (address, bytes32, uint256, address[], uint256[], IBalancerV2Vault.PoolBalanceChange)
        );
    }

    /// @dev Helper to decode the encoded call arguments for claiming rewards
    function __decodeClaimRewardsCallArgs(bytes memory _actionData) internal pure returns (address stakingToken_) {
        return abi.decode(_actionData, (address));
    }

    /// @dev Helper to decode callArgs for stake and unstake
    function __decodeStakingActionCallArgs(bytes memory _encodedCallArgs)
        internal
        pure
        returns (address stakingToken_, uint256 bptAmount_)
    {
        return abi.decode(_encodedCallArgs, (address, uint256));
    }

    /// @dev Helper to decode callArgs for takeOrder().
    /// See takeOrder() comments for args explanation.
    function __decodeTakeOrderCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            IBalancerV2Vault.SwapKind kind_,
            IBalancerV2Vault.BatchSwapStep[] memory swaps_,
            address[] memory assets_,
            int256[] memory limits_,
            address[] memory stakingTokens_
        )
    {
        return abi.decode(
            _encodedCallArgs,
            (IBalancerV2Vault.SwapKind, IBalancerV2Vault.BatchSwapStep[], address[], int256[], address[])
        );
    }
}

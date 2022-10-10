// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../../interfaces/IBalancerV2Vault.sol";
import "../../../../../utils/AddressArrayLib.sol";
import "../../utils/actions/BalancerV2ActionsMixin.sol";
import "../../utils/AdapterBase.sol";

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

    /// @dev Logic to get the BPT address for a given staking token
    function __getBptForStakingToken(address _stakingToken)
        internal
        view
        virtual
        returns (address bpt_);

    /// @dev Logic to check whether a given BPT is valid for the given staking token
    function __isValidBptForStakingToken(address _stakingToken, address _bpt)
        internal
        view
        virtual
        returns (bool isValid_);

    /// @dev Logic to stake BPT to a given staking token.
    /// Staking is always the last action and thus always sent to the _vaultProxy
    /// (rather than a more generically-named `_recipient`).
    function __stake(
        address _vaultProxy,
        address _stakingToken,
        uint256 _bptAmount
    ) internal virtual;

    /// @dev Logic to unstake BPT from a given staking token
    function __unstake(
        address _vaultProxy,
        address _recipient,
        address _stakingToken,
        uint256 _bptAmount
    ) internal virtual;

    /////////////
    // ACTIONS //
    /////////////

    // EXTERNAL FUNCTIONS

    /// @notice Claims all rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @dev Needs `onlyIntegrationManager` because Minter claiming permission is given by the fund
    function claimRewards(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        __claimRewards(_vaultProxy, __decodeClaimRewardsCallArgs(_actionData));
    }

    /// @notice Lends assets for LP tokens, then stakes the received LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function lendAndStake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            address stakingToken,
            bytes32 poolId,
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            IBalancerV2Vault.PoolBalanceChange memory request
        ) = __decodeCombinedActionCallArgs(_actionData);

        __lend(address(this), poolId, spendAssets, spendAssetAmounts, request);

        __stake(
            _vaultProxy,
            stakingToken,
            ERC20(__parseBalancerPoolAddress(poolId)).balanceOf(address(this))
        );

        // There can be different join/exit options per Balancer pool type,
        // some of which involve spending only up-to-max amounts
        __pushFullAssetBalances(_vaultProxy, spendAssets);
    }

    /// @notice Stakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function stake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(_actionData);

        __stake(_vaultProxy, stakingToken, bptAmount);
    }

    /// @notice Unstakes LP tokens
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unstake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(_actionData);

        __unstake(_vaultProxy, _vaultProxy, stakingToken, bptAmount);
    }

    /// @notice Unstakes LP tokens, then redeems them
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unstakeAndRedeem(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
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
        address bpt = __getBptForStakingToken(stakingToken);
        uint256 remainingBpt = ERC20(bpt).balanceOf(address(this));
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
            __approveAssetMaxAsNeeded(
                _spendAssets[i],
                address(BALANCER_VAULT_CONTRACT),
                _spendAssetAmounts[i]
            );
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
            __parseBalancerPoolAddress(_poolId),
            address(BALANCER_VAULT_CONTRACT),
            _spendBptAmount
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
                    preTxTokenBalancesIfUnused[i] = ERC20(_request.assets[i]).balanceOf(
                        _vaultProxy
                    );
                    remainingCount--;
                }
            }
        }

        __balancerV2Redeem(_poolId, address(this), payable(_vaultProxy), _request);

        if (unusedTokensCount > 0) {
            for (uint256 i; unusedTokensCount > 0; i++) {
                if (!_expectedIncomingTokens.contains(_request.assets[i])) {
                    require(
                        ERC20(_request.assets[i]).balanceOf(_vaultProxy) ==
                            preTxTokenBalancesIfUnused[i],
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
    function parseAssetsForAction(
        address,
        bytes4 _selector,
        bytes calldata _actionData
    )
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
        (
            stakingToken,
            poolId,
            minIncomingAssetAmounts_[0],
            spendAssets_,
            spendAssetAmounts_,
            request
        ) = __decodeCombinedActionCallArgs(_encodedCallArgs);

        __validateBptForStakingToken(stakingToken, __getBptForStakingToken(stakingToken));
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
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(
            _encodedCallArgs
        );

        address bpt = __getBptForStakingToken(stakingToken);

        __validateBptForStakingToken(stakingToken, bpt);

        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        spendAssets_[0] = bpt;
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
        (address stakingToken, uint256 bptAmount) = __decodeStakingActionCallArgs(
            _encodedCallArgs
        );

        address bpt = __getBptForStakingToken(stakingToken);

        __validateBptForStakingToken(stakingToken, bpt);

        spendAssets_ = new address[](1);
        spendAssetAmounts_ = new uint256[](1);
        incomingAssets_ = new address[](1);
        minIncomingAssetAmounts_ = new uint256[](1);

        spendAssets_[0] = stakingToken;
        spendAssetAmounts_[0] = bptAmount;

        incomingAssets_[0] = bpt;
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
        (
            stakingToken,
            poolId,
            spendAssetAmounts_[0],
            incomingAssets_,
            minIncomingAssetAmounts_,
            request
        ) = __decodeCombinedActionCallArgs(_encodedCallArgs);

        __validateBptForStakingToken(stakingToken, __getBptForStakingToken(stakingToken));
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
    function __parseBalancerPoolAddress(bytes32 _poolId)
        internal
        pure
        returns (address poolAddress_)
    {
        return address(uint256(_poolId) >> (12 * 8));
    }

    /// @dev Helper to validate a given BPT for a given staking token
    function __validateBptForStakingToken(address _stakingToken, address _bpt) internal view {
        require(
            __isValidBptForStakingToken(_stakingToken, _bpt),
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
        return
            abi.decode(
                _encodedCallArgs,
                (
                    address,
                    bytes32,
                    uint256,
                    address[],
                    uint256[],
                    IBalancerV2Vault.PoolBalanceChange
                )
            );
    }

    /// @dev Helper to decode the encoded call arguments for claiming rewards
    function __decodeClaimRewardsCallArgs(bytes memory _actionData)
        internal
        pure
        returns (address stakingToken_)
    {
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
}

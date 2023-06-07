// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import "../../../../../external-interfaces/IConvexBaseRewardPool.sol";
import "../../../../../external-interfaces/IConvexCvxLockerV2.sol";
import "../../../../../external-interfaces/IConvexVlCvxExtraRewardDistribution.sol";
import "../../../../../external-interfaces/ISnapshotDelegateRegistry.sol";
import "../../../../../external-interfaces/IVotiumMultiMerkleStash.sol";
import "../../../../../utils/0.6.12/AssetHelpers.sol";
import "./ConvexVotingPositionDataDecoder.sol";
import "./IConvexVotingPosition.sol";

/// @title ConvexVotingPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for Convex vlCVX positions
contract ConvexVotingPositionLib is IConvexVotingPosition, ConvexVotingPositionDataDecoder, AssetHelpers {
    using SafeERC20 for ERC20;

    bytes32 private constant CONVEX_SNAPSHOT_ID = "cvx.eth";

    IConvexBaseRewardPool private immutable CVX_CRV_STAKING_CONTRACT;
    ERC20 private immutable CVX_TOKEN_CONTRACT;
    ISnapshotDelegateRegistry private immutable SNAPSHOT_DELEGATE_REGISTRY;
    IConvexCvxLockerV2 private immutable VLCVX_CONTRACT;
    IConvexVlCvxExtraRewardDistribution private immutable VLCVX_EXTRA_REWARDS_CONTRACT;
    IVotiumMultiMerkleStash private immutable VOTIUM_MULTI_MERKLE_STASH_CONTRACT;

    constructor(
        address _vlCvx,
        address _vlCvxExtraRewards,
        address _cvxCrvStaking,
        address _cvxToken,
        address _snapshotDelegateRegistry,
        address _votiumMultiMerkleStash
    ) public {
        CVX_CRV_STAKING_CONTRACT = IConvexBaseRewardPool(_cvxCrvStaking);
        CVX_TOKEN_CONTRACT = ERC20(_cvxToken);
        SNAPSHOT_DELEGATE_REGISTRY = ISnapshotDelegateRegistry(_snapshotDelegateRegistry);
        VLCVX_CONTRACT = IConvexCvxLockerV2(_vlCvx);
        VLCVX_EXTRA_REWARDS_CONTRACT = IConvexVlCvxExtraRewardDistribution(_vlCvxExtraRewards);
        VOTIUM_MULTI_MERKLE_STASH_CONTRACT = IVotiumMultiMerkleStash(_votiumMultiMerkleStash);
    }

    /// @notice Initializes the external position
    function init(bytes memory) external override {
        // Max approve the locker contract, which will never need to be set again
        CVX_TOKEN_CONTRACT.safeApprove(address(VLCVX_CONTRACT), type(uint256).max);
    }

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.Lock)) {
            __lock(actionArgs);
        } else if (actionId == uint256(Actions.Relock)) {
            __relock();
        } else if (actionId == uint256(Actions.Withdraw)) {
            __withdraw();
        } else if (actionId == uint256(Actions.ClaimRewards)) {
            __claimRewards(actionArgs);
        } else if (actionId == uint256(Actions.Delegate)) {
            __delegate(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    // CVX STAKING

    /// @dev Helper to lock CVX for vlCVX
    function __lock(bytes memory _actionArgs) private {
        (uint256 amount, uint256 spendRatio) = __decodeLockActionArgs(_actionArgs);
        VLCVX_CONTRACT.lock(address(this), amount, spendRatio);
    }

    /// @dev Helper to relock all CVX for vlCVX after the locked period has expired
    function __relock() private {
        VLCVX_CONTRACT.processExpiredLocks(true);
    }

    /// @dev Helper to withdraw all CVX to the vault
    function __withdraw() private {
        VLCVX_CONTRACT.withdrawExpiredLocksTo(msg.sender);
    }

    // VOTING

    /// @dev Helper to delegate voting power for vlCVX proposals on Snapshot
    function __delegate(bytes memory _actionArgs) private {
        address delegate = __decodeDelegateActionArgs(_actionArgs);
        SNAPSHOT_DELEGATE_REGISTRY.setDelegate(CONVEX_SNAPSHOT_ID, delegate);
    }

    // REWARD CLAIMING

    /// @dev Helper to claim rewards and send them to the vault.
    /// Handles:
    /// 1. claiming from vlCVX
    /// 2. claiming from vlCvxExtraRewardDistribution
    /// 3. claiming from Votium
    /// 4. unstaking cvxCrv (for griefing edge case of 3rd party claiming rewards on behalf of
    /// address(this), specifying to stake the claimed cvxCrv)
    /// 5. sending any tokens currently in the contract to the VaultProxy
    /// All claimed tokens need to be included in `allTokensToTransfer`.
    function __claimRewards(bytes memory _actionArgs) private {
        (
            address[] memory allTokensToTransfer,
            bool claimLockerRewards,
            address[] memory extraRewardTokens,
            IVotiumMultiMerkleStash.ClaimParam[] memory votiumClaims,
            bool unstakeCvxCrv
        ) = __decodeClaimRewardsActionArgs(_actionArgs);

        // Claim rewards from vlCVX locker
        if (claimLockerRewards) {
            VLCVX_CONTRACT.getReward(address(this));
        }

        // Claim rewards from vlCvxExtraRewardDistribution
        for (uint256 i; i < extraRewardTokens.length; i++) {
            VLCVX_EXTRA_REWARDS_CONTRACT.getReward(address(this), extraRewardTokens[i]);
        }

        // Claim rewards from Votium
        if (votiumClaims.length > 0) {
            VOTIUM_MULTI_MERKLE_STASH_CONTRACT.claimMulti(address(this), votiumClaims);
        }

        // Unstake any cvxCrv that was claimed and staked on behalf of address(this)
        if (unstakeCvxCrv) {
            // Auto-claims any rewards accrued to staked cvxCrv
            CVX_CRV_STAKING_CONTRACT.withdraw(CVX_CRV_STAKING_CONTRACT.balanceOf(address(this)), true);
        }

        __pushFullAssetBalances(msg.sender, allTokensToTransfer);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        // In addition to vlCVX, must also account for the CVX balance in this contract,
        // in case `kickExpiredLocks()` is called on the locker for expired vlCVX
        uint256 totalCvxBalance =
            CVX_TOKEN_CONTRACT.balanceOf(address(this)) + VLCVX_CONTRACT.lockedBalanceOf(address(this));

        if (totalCvxBalance > 0) {
            assets_ = new address[](1);
            assets_[0] = address(CVX_TOKEN_CONTRACT);

            amounts_ = new uint256[](1);
            amounts_[0] = totalCvxBalance;
        }

        return (assets_, amounts_);
    }
}

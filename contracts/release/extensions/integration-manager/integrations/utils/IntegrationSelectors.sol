// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IntegrationSelectors Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Selectors for integration actions
/// @dev Selectors are created from their signatures rather than hardcoded for easy verification
abstract contract IntegrationSelectors {
    // Tracked assets
    bytes4 public constant ADD_TRACKED_ASSETS_SELECTOR = bytes4(
        keccak256("addTrackedAssets(address,bytes,bytes)")
    );
    bytes4 public constant REMOVE_TRACKED_ASSETS_SELECTOR = bytes4(
        keccak256("removeTrackedAssets(address,bytes,bytes)")
    );

    // Asset approval
    bytes4 public constant APPROVE_ASSETS_SELECTOR = bytes4(
        keccak256("approveAssets(address,bytes,bytes)")
    );

    // Trading
    bytes4 public constant TAKE_ORDER_SELECTOR = bytes4(
        keccak256("takeOrder(address,bytes,bytes)")
    );

    // Lending
    bytes4 public constant LEND_SELECTOR = bytes4(keccak256("lend(address,bytes,bytes)"));
    bytes4 public constant REDEEM_SELECTOR = bytes4(keccak256("redeem(address,bytes,bytes)"));

    // Staking
    bytes4 public constant STAKE_SELECTOR = bytes4(keccak256("stake(address,bytes,bytes)"));
    bytes4 public constant UNSTAKE_SELECTOR = bytes4(keccak256("unstake(address,bytes,bytes)"));

    // Rewards
    bytes4 public constant CLAIM_REWARDS_SELECTOR = bytes4(
        keccak256("claimRewards(address,bytes,bytes)")
    );

    // Combined
    bytes4 public constant CLAIM_REWARDS_AND_REINVEST_SELECTOR = bytes4(
        keccak256("claimRewardsAndReinvest(address,bytes,bytes)")
    );
    bytes4 public constant CLAIM_REWARDS_AND_SWAP_SELECTOR = bytes4(
        keccak256("claimRewardsAndSwap(address,bytes,bytes)")
    );
    bytes4 public constant LEND_AND_STAKE_SELECTOR = bytes4(
        keccak256("lendAndStake(address,bytes,bytes)")
    );
    bytes4 public constant UNSTAKE_AND_REDEEM_SELECTOR = bytes4(
        keccak256("unstakeAndRedeem(address,bytes,bytes)")
    );
}

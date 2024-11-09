// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IntegrationSelectors Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Selectors for integration actions
/// @dev Selectors are created from their signatures rather than hardcoded for easy verification
abstract contract IntegrationSelectors {
    // General action
    bytes4 internal constant ACTION_SELECTOR = bytes4(keccak256("action(address,bytes,bytes)"));

    // Trading
    bytes4 internal constant TAKE_MULTIPLE_ORDERS_SELECTOR =
        bytes4(keccak256("takeMultipleOrders(address,bytes,bytes)"));
    bytes4 internal constant TAKE_ORDER_SELECTOR = bytes4(keccak256("takeOrder(address,bytes,bytes)"));

    // Lending
    bytes4 internal constant LEND_SELECTOR = bytes4(keccak256("lend(address,bytes,bytes)"));
    bytes4 internal constant REDEEM_SELECTOR = bytes4(keccak256("redeem(address,bytes,bytes)"));

    // Staking
    bytes4 internal constant STAKE_SELECTOR = bytes4(keccak256("stake(address,bytes,bytes)"));
    bytes4 internal constant UNSTAKE_SELECTOR = bytes4(keccak256("unstake(address,bytes,bytes)"));

    // Rewards
    bytes4 internal constant CLAIM_REWARDS_SELECTOR = bytes4(keccak256("claimRewards(address,bytes,bytes)"));

    // Combined
    bytes4 internal constant LEND_AND_STAKE_SELECTOR = bytes4(keccak256("lendAndStake(address,bytes,bytes)"));
    bytes4 internal constant UNSTAKE_AND_REDEEM_SELECTOR = bytes4(keccak256("unstakeAndRedeem(address,bytes,bytes)"));

    // Wrapping
    bytes4 internal constant WRAP_SELECTOR = bytes4(keccak256("wrap(address,bytes,bytes)"));
    bytes4 internal constant UNWRAP_SELECTOR = bytes4(keccak256("unwrap(address,bytes,bytes)"));

    // Transfers
    bytes4 internal constant TRANSFER_SELECTOR = bytes4(keccak256("transfer(address,bytes,bytes)"));
}

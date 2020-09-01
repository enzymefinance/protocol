// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IntegrationSelectors Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Selectors for integration actions
/// @dev Selectors are created from their signatures rather than hardcoded for easy verification
contract IntegrationSelectors {
    // Trading
    bytes4 public constant TAKE_ORDER_SELECTOR = bytes4(
        keccak256("takeOrder(address,bytes,bytes)")
    );

    // Lending
    bytes4 public constant LEND_SELECTOR = bytes4(keccak256("lend(address,bytes,bytes)"));
    bytes4 public constant REDEEM_SELECTOR = bytes4(keccak256("redeem(address,bytes,bytes)"));
}

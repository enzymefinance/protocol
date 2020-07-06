// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IntegrationSignatures Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Hard-coded signatures for integration actions
contract IntegrationSignatures {
    // Trading
    bytes4 constant public TAKE_ORDER_SELECTOR = bytes4(keccak256("takeOrder(bytes,bytes)"));

    // Lending
    bytes4 constant public LEND_SELECTOR = bytes4(keccak256("lend(bytes,bytes)"));
    bytes4 constant public REDEEM_SELECTOR = bytes4(keccak256("redeem(bytes,bytes)"));
}

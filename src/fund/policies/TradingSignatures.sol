// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title TradingSignatures Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Hard-coded signatures
contract TradingSignatures {
    bytes4 constant public TAKE_ORDER = bytes4(keccak256("takeOrder(bytes)"));
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title GasRelayPaymasterLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and events
/// for a GasRelayPaymasterLib
/// @dev DO NOT EDIT CONTRACT ONCE DEPLOYED. If new events or storage are necessary,
/// they should be added to a numbered GasRelayPaymasterLibBaseXXX that inherits the previous base.
/// e.g., `GasRelayPaymasterLibBase2 is GasRelayPaymasterLibBase1`
abstract contract GasRelayPaymasterLibBase1 {
    event Deposited(uint256 amount);

    event TransactionRelayed(address indexed authorizer, bytes4 invokedSelector, bool successful);

    event Withdrawn(uint256 amount);

    // Pseudo-constants
    address internal parentVault;
}

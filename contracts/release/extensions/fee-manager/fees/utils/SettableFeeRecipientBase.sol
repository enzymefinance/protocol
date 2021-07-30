// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title SettableFeeRecipientBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base contract to set and get a fee recipient for the inheriting fee
abstract contract SettableFeeRecipientBase {
    event RecipientSetForFund(address indexed comptrollerProxy, address indexed recipient);

    mapping(address => address) private comptrollerProxyToRecipient;

    /// @dev Helper to set a fee recipient
    function __setRecipientForFund(address _comptrollerProxy, address _recipient) internal {
        comptrollerProxyToRecipient[_comptrollerProxy] = _recipient;

        emit RecipientSetForFund(_comptrollerProxy, _recipient);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the recipient of the fee for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return recipient_ The recipient
    /// @dev address(0) signifies the VaultProxy owner
    function getRecipientForFund(address _comptrollerProxy)
        public
        view
        virtual
        returns (address recipient_)
    {
        return comptrollerProxyToRecipient[_comptrollerProxy];
    }
}

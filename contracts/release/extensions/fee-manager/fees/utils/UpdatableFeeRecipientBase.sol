// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "./SettableFeeRecipientBase.sol";

/// @title UpdatableFeeRecipientBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A base contract that provides an updatable fee recipient for the inheriting fee
abstract contract UpdatableFeeRecipientBase is SettableFeeRecipientBase {
    /// @notice Sets the fee recipient for the given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @param _recipient The fee recipient
    function setRecipientForFund(address _comptrollerProxy, address _recipient) external {
        require(
            msg.sender == VaultLib(payable(ComptrollerLib(_comptrollerProxy).getVaultProxy())).getOwner(),
            "__setRecipientForFund: Only vault owner callable"
        );

        __setRecipientForFund(_comptrollerProxy, _recipient);
    }
}

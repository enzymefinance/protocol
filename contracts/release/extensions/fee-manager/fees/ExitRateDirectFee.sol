// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./utils/ExitRateFeeBase.sol";
import "./utils/UpdatableFeeRecipientBase.sol";

/// @title ExitRateDirectFee Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An ExitRateFee that transfers the fee shares to a recipient
contract ExitRateDirectFee is ExitRateFeeBase, UpdatableFeeRecipientBase {
    constructor(address _feeManager) public ExitRateFeeBase(_feeManager, IFeeManager.SettlementType.Direct) {}

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee for a fund
    /// @dev onlyFeeManager validated by parent
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData) public override {
        super.addFundSettings(_comptrollerProxy, _settingsData);

        (,, address recipient) = abi.decode(_settingsData, (uint256, uint256, address));

        if (recipient != address(0)) {
            __setRecipientForFund(_comptrollerProxy, recipient);
        }
    }

    /// @notice Gets the recipient of the fee for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return recipient_ The recipient
    function getRecipientForFund(address _comptrollerProxy)
        public
        view
        override(FeeBase, SettableFeeRecipientBase)
        returns (address recipient_)
    {
        return SettableFeeRecipientBase.getRecipientForFund(_comptrollerProxy);
    }
}

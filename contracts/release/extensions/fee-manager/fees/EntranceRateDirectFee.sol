// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./utils/EntranceRateFeeBase.sol";

/// @title EntranceRateDirectFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An EntranceRateFee that sends the fee to the fund manager
contract EntranceRateDirectFee is EntranceRateFeeBase {
    constructor(address _feeManager)
        public
        EntranceRateFeeBase(_feeManager, IFeeManager.SettlementType.Direct)
    {}
}

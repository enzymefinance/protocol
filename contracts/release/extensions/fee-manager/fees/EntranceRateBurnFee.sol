// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./utils/EntranceRateFeeBase.sol";

/// @title EntranceRateBurnFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An EntranceRateFee that burns the fee
contract EntranceRateBurnFee is EntranceRateFeeBase {
    constructor(address _feeManager)
        public
        EntranceRateFeeBase(_feeManager, IFeeManager.SettlementType.Burn)
    {}
}

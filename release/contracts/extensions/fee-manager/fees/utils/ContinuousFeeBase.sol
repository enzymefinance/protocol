// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./FeeBase.sol";

/// @title ContinuousFeeBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for Continuous fees
abstract contract ContinuousFeeBase is FeeBase {
    constructor(address _feeManager) public FeeBase(_feeManager) {}

    /// @notice Provides a constant string identifier for a policy
    function feeHook() external override view returns (IFeeManager.FeeHook feeHook_) {
        return IFeeManager.FeeHook.Continuous;
    }
}

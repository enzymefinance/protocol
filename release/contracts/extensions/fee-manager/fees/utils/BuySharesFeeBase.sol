// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./FeeBase.sol";

/// @title BuySharesFeeBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for BuyShares fees
abstract contract BuySharesFeeBase is FeeBase {
    constructor(address _feeManager) public FeeBase(_feeManager) {}

    /// @notice Provides a constant string identifier for a policy
    function feeHook() external override view returns (IFeeManager.FeeHook feeHook_) {
        return IFeeManager.FeeHook.BuyShares;
    }

    /// @notice Helper to parse settlement arguments from encoded data
    function __decodeSettlementData(bytes memory _settlementData)
        internal
        pure
        returns (
            address buyer_,
            uint256 investmentAmount_,
            uint256 sharesBought_
        )
    {
        return abi.decode(_settlementData, (address, uint256, uint256));
    }
}

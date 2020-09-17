// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../IFee.sol";

/// @title FeeBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for fees
abstract contract FeeBase is IFee {
    address internal immutable FEE_MANAGER;

    modifier onlyFeeManager {
        require(msg.sender == FEE_MANAGER, "Only the FeeManger can make this call");
        _;
    }

    constructor(address _feeManager) public {
        FEE_MANAGER = _feeManager;
    }

    function activateForFund(address) external virtual override {
        // UNIMPLEMENTED
    }

    /// @dev Returns empty by default, can be overridden by fee
    function payout(address) external virtual override returns (bool) {
        return false;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getFeeManager() external view returns (address feeManager_) {
        return FEE_MANAGER;
    }
}

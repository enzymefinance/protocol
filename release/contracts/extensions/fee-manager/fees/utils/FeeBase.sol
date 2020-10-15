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

    /// @notice Helper to parse settlement arguments from encoded data
    function __decodePreBuySharesSettlementData(bytes memory _settlementData)
        internal
        pure
        returns (
            address buyer_,
            uint256 investmentAmount_,
            uint256 minSharesQuantity_
        )
    {
        return abi.decode(_settlementData, (address, uint256, uint256));
    }

    /// @notice Helper to parse settlement arguments from encoded data
    function __decodePreRedeemSharesSettlementData(bytes memory _settlementData)
        internal
        pure
        returns (address redeemer_, uint256 sharesQuantity_)
    {
        return abi.decode(_settlementData, (address, uint256));
    }

    /// @notice Helper to parse settlement arguments from encoded data
    function __decodePostBuySharesSettlementData(bytes memory _settlementData)
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

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getFeeManager() external view returns (address feeManager_) {
        return FEE_MANAGER;
    }
}

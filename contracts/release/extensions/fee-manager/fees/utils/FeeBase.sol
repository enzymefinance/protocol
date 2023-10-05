// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IFeeManager} from "../../IFeeManager.sol";
import {IFee} from "../../IFee.sol";

/// @title FeeBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract base contract for all fees
abstract contract FeeBase is IFee {
    address internal immutable FEE_MANAGER;

    modifier onlyFeeManager() {
        require(msg.sender == FEE_MANAGER, "Only the FeeManger can make this call");
        _;
    }

    constructor(address _feeManager) public {
        FEE_MANAGER = _feeManager;
    }

    /// @notice Allows Fee to run logic during fund activation
    /// @dev Unimplemented by default, may be overrode.
    function activateForFund(address, address) external virtual override {
        return;
    }

    /// @notice Gets the recipient of the fee for a given fund
    /// @dev address(0) signifies the VaultProxy owner.
    /// Returns address(0) by default, can be overridden by fee.
    function getRecipientForFund(address) external view virtual override returns (address recipient_) {
        return address(0);
    }

    /// @notice Runs payout logic for a fee that utilizes shares outstanding as its settlement type
    /// @dev Returns false by default, can be overridden by fee
    function payout(address, address) external virtual override returns (bool) {
        return false;
    }

    /// @notice Update fee state after all settlement has occurred during a given fee hook
    /// @dev Unimplemented by default, can be overridden by fee
    function update(address, address, IFeeManager.FeeHook, bytes calldata, uint256) external virtual override {
        return;
    }

    /// @notice Gets whether the fee updates and requires GAV on a particular hook
    /// @return updates_ True if the fee updates on the _hook
    /// @return usesGav_ True if the fee uses GAV during update() for the _hook
    /// @dev Returns false values by default, can be overridden by fee
    function updatesOnHook(IFeeManager.FeeHook) external view virtual override returns (bool updates_, bool usesGav_) {
        return (false, false);
    }

    /// @notice Helper to parse settlement arguments from encoded data for PreBuyShares fee hook
    function __decodePreBuySharesSettlementData(bytes memory _settlementData)
        internal
        pure
        returns (address buyer_, uint256 investmentAmount_)
    {
        return abi.decode(_settlementData, (address, uint256));
    }

    /// @notice Helper to parse settlement arguments from encoded data for PreRedeemShares fee hook
    function __decodePreRedeemSharesSettlementData(bytes memory _settlementData)
        internal
        pure
        returns (address redeemer_, uint256 sharesQuantity_, bool forSpecificAssets_)
    {
        return abi.decode(_settlementData, (address, uint256, bool));
    }

    /// @notice Helper to parse settlement arguments from encoded data for PostBuyShares fee hook
    function __decodePostBuySharesSettlementData(bytes memory _settlementData)
        internal
        pure
        returns (address buyer_, uint256 investmentAmount_, uint256 sharesIssued_)
    {
        return abi.decode(_settlementData, (address, uint256, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FEE_MANAGER` variable
    /// @return feeManager_ The `FEE_MANAGER` variable value
    function getFeeManager() external view returns (address feeManager_) {
        return FEE_MANAGER;
    }
}

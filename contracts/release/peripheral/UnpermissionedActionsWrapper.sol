// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../core/fund/comptroller/ComptrollerLib.sol";
import "../extensions/fee-manager/FeeManager.sol";

/// @title UnpermissionedActionsWrapper Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Logic related to wrapping actions that do not need access control
contract UnpermissionedActionsWrapper {
    address private immutable FEE_MANAGER;

    constructor(address _feeManager) public {
        FEE_MANAGER = _feeManager;
    }

    /// @notice Gets all fees that implement the `Continuous` fee hook for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return continuousFees_ The fees that implement the `Continuous` fee hook
    function getContinuousFeesForFund(address _comptrollerProxy)
        external
        view
        returns (address[] memory continuousFees_)
    {
        FeeManager feeManagerContract = FeeManager(getFeeManager());

        address[] memory fees = feeManagerContract.getEnabledFeesForFund(_comptrollerProxy);

        // Count the continuous fees
        uint256 continuousFeesCount;
        bool[] memory implementsContinuousHook = new bool[](fees.length);
        for (uint256 i; i < fees.length; i++) {
            (bool settles, ) = IFee(fees[i]).settlesOnHook(IFeeManager.FeeHook.Continuous);
            if (settles) {
                continuousFeesCount++;
                implementsContinuousHook[i] = true;
            }
        }

        // Return early if no continuous fees
        if (continuousFeesCount == 0) {
            return new address[](0);
        }

        // Create continuous fees array
        continuousFees_ = new address[](continuousFeesCount);
        uint256 continuousFeesIndex;
        for (uint256 i; i < fees.length; i++) {
            if (implementsContinuousHook[i]) {
                continuousFees_[continuousFeesIndex] = fees[i];
                continuousFeesIndex++;
            }
        }

        return continuousFees_;
    }

    /// @notice Invokes the Continuous fee hook on all specified fees, and then attempts to payout
    /// any shares outstanding on those fees
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _fees The fees for which to run these actions
    /// @dev This is just a wrapper to execute two callOnExtension() actions atomically, in sequence.
    /// The caller must pass in the fees that they want to run this logic on.
    function invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
        address _comptrollerProxy,
        address[] calldata _fees
    ) external {
        ComptrollerLib comptrollerProxyContract = ComptrollerLib(_comptrollerProxy);

        comptrollerProxyContract.callOnExtension(getFeeManager(), 0, "");
        comptrollerProxyContract.callOnExtension(getFeeManager(), 1, abi.encode(_fees));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FEE_MANAGER` variable
    /// @return feeManager_ The `FEE_MANAGER` variable value
    function getFeeManager() public view returns (address feeManager_) {
        return FEE_MANAGER;
    }
}

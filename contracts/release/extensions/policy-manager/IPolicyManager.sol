// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title PolicyManager Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for the PolicyManager
interface IPolicyManager {
    enum PolicyHook {
        BuySharesSetup,
        PreBuyShares,
        PostBuyShares,
        BuySharesCompleted,
        PreCallOnIntegration,
        PostCallOnIntegration
    }

    function validatePolicies(
        address,
        PolicyHook,
        bytes calldata
    ) external;
}

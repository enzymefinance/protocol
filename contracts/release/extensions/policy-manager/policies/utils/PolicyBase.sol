// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../IPolicy.sol";

/// @title PolicyBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for policies
abstract contract PolicyBase is IPolicy {
    address internal immutable POLICY_MANAGER;

    modifier onlyPolicyManager {
        require(msg.sender == POLICY_MANAGER, "Only the PolicyManager can make this call");
        _;
    }

    constructor(address _policyManager) public {
        POLICY_MANAGER = _policyManager;
    }

    /// @notice Validates and initializes a policy as necessary prior to fund activation
    /// @dev Disallowed by default
    function activateForFund(address, address) external virtual override {
        // UNIMPLEMENTED
    }

    /// @notice Update the policy settings for a fund
    /// @dev Disallowed by default
    function updateFundSettings(
        address,
        address,
        bytes calldata
    ) external virtual override {
        revert("updateFundSettings: Updates not allowed for this policy");
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the PolicyManager contract address
    /// @return policyManager_ The PolicyManager contract address
    function getPolicyManager() external view returns (address policyManager_) {
        return POLICY_MANAGER;
    }
}

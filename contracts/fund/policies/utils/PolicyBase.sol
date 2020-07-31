// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../registry/Registry.sol";
import "../../hub/Hub.sol";
import "../../hub/Spoke.sol";
import "../../hub/SpokeCallee.sol";
import "../IPolicy.sol";

/// @title PolicyBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for policies
abstract contract PolicyBase is IPolicy, SpokeCallee {
    address public REGISTRY;

    modifier onlyPolicyManager {
        require(__isPolicyManager(msg.sender), "Only PolicyManger can make this call");
        _;
    }

    constructor(address _registry) public {
        REGISTRY = _registry;
    }

    /// @notice Update the policy settings for a fund
    /// @dev Disallowed by default
    function updateFundSettings(bytes calldata) external virtual override {
        revert("updateFundSettings: Updates not allowed for this policy");
    }

    /// @notice Helper to determine whether an address is a valid PolicyManager component
    function __isPolicyManager(address _who) internal view returns (bool) {
        // 1. Is valid Spoke of a Registered fund
        // 2. Is the policy manager of the registered fund
        try Spoke(_who).HUB() returns (address hub) {
            return Registry(REGISTRY).fundIsRegistered(hub) && __getPolicyManager(hub) == _who;
        }
        catch {
            return false;
        }
    }
}

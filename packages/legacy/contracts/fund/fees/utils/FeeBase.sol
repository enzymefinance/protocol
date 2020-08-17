// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../registry/Registry.sol";
import "../../hub/Hub.sol";
import "../../hub/Spoke.sol";
import "../../hub/SpokeCallee.sol";
import "../IFee.sol";

/// @title FeeBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for fees
abstract contract FeeBase is IFee, SpokeCallee {
    address public REGISTRY;

    modifier onlyFeeManager {
        require(__isFeeManager(msg.sender), "Only FeeManger can make this call");
        _;
    }

    constructor(address _registry) public {
        REGISTRY = _registry;
    }

    /// @dev Returns empty by default, can be overridden by fee
    function payoutSharesOutstanding()
        external
        virtual
        override
        returns (
            address,
            address,
            uint256
        )
    {
        return __emptySharesDueValues();
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to return empty values for settlement and payout
    function __emptySharesDueValues()
        internal
        pure
        returns (
            address,
            address,
            uint256
        )
    {
        return (address(0), address(0), 0);
    }

    /// @notice Helper to determine whether an address is a valid FeeManager component
    function __isFeeManager(address _who) internal view returns (bool) {
        // 1. Is valid Spoke of a Registered fund
        // 2. Is the fee manager of the registered fund
        try Spoke(_who).HUB() returns (address hub) {
            return Registry(REGISTRY).fundIsRegistered(hub) && __getFeeManager(hub) == _who;
        } catch {
            return false;
        }
    }
}

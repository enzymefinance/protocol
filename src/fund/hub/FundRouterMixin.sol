pragma solidity 0.6.4;

import "../../registry/IRegistry.sol";
import "./IHub.sol";

/// @title FundRouterMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin that provides routing for a given fund
abstract contract FundRouterMixin {
    function __getFeeManager(address _hub) internal view returns (address) {
        return IHub(_hub).feeManager();
    }

    function __getPolicyManager(address _hub) internal view returns (address) {
        return IHub(_hub).policyManager();
    }

    function __getPriceSource(address _hub) internal view returns (address) {
        return IRegistry(__getRegistry(_hub)).priceSource();
    }

    function __getRegistry(address _hub) internal view returns (address) {
        return IHub(_hub).REGISTRY();
    }

    function __getShares(address _hub) internal view returns (address) {
        return IHub(_hub).shares();
    }

    function __getVault(address _hub) internal view returns (address) {
        return IHub(_hub).vault();
    }
}

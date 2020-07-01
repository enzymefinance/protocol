pragma solidity 0.6.8;

import "./ISpoke.sol";
import "./FundRouterMixin.sol";

/// @title SpokeCallee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A fund router helper for plugins called by a fund component
abstract contract SpokeCallee is FundRouterMixin {
    function __getFeeManager() internal view returns (address) {
        return __getFeeManager(__getHub());
    }

    function __getHub() internal view returns (address) {
        return ISpoke(msg.sender).HUB();
    }

    function __getPolicyManager() internal view returns (address) {
        return __getPolicyManager(__getHub());
    }

    function __getPriceSource() internal view returns (address) {
        return __getPriceSource(__getHub());
    }

    function __getRegistry() internal view returns (address) {
        return __getRegistry(__getHub());
    }

    function __getShares() internal view returns (address) {
        return __getShares(__getHub());
    }

    function __getValueInterpreter() internal view returns (address) {
        return __getValueInterpreter(__getHub());
    }

    function __getVault() internal view returns (address) {
        return __getVault(__getHub());
    }
}

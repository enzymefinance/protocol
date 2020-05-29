pragma solidity 0.6.8;

import "../../registry/IRegistry.sol";
import "../../prices/IPriceSource.sol";
import "../fees/IFeeManager.sol";
import "../policies/IPolicyManager.sol";
import "../shares/IShares.sol";
import "../vault/IVault.sol";
import "./IHub.sol";
import "./ISpoke.sol";
import "./FundRouterMixin.sol";

/// @title Spoke Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A component of a fund connected to a hub
abstract contract Spoke is ISpoke, FundRouterMixin {
    // TODO: set as immutable upon solidity upgrade
    address public override HUB;

    modifier onlyManager() {
        require(msg.sender == IHub(HUB).MANAGER(), "Only the fund manager can call this function");
        _;
    }

    modifier onlyShares() {
        require(msg.sender == address(__getShares()), "Only Shares can call this function");
        _; 
    }

    constructor(address _hub) public {
        HUB = _hub;
    }

    function __getFeeManager() internal view returns (IFeeManager) {
        return IFeeManager(__getFeeManager(HUB));
    }

    function __getHub() internal view returns (IHub) {
        return IHub(HUB);
    }

    function __getPolicyManager() internal view returns (IPolicyManager) {
        return IPolicyManager(__getPolicyManager(HUB));
    }

    function __getPriceSource() internal view returns (IPriceSource) {
        return IPriceSource(__getPriceSource(HUB));
    }

    function __getRegistry() internal view returns (IRegistry) {
        return IRegistry(__getRegistry(HUB));
    }

    function __getShares() internal view returns (IShares) {
        return IShares(__getShares(HUB));
    }

    function __getVault() internal view returns (IVault) {
        return IVault(__getVault(HUB));
    }
}

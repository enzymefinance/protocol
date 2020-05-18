pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../../registry/IRegistry.sol";
import "../../prices/IPriceSource.sol";
import "../fees/IFeeManager.sol";
import "../policies/IPolicyManager.sol";
import "../shares/IShares.sol";
import "../vault/IVault.sol";
import "./IHub.sol";
import "./ISpoke.sol";

/// @title Spoke Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A component of a fund connected to a hub
contract Spoke is ISpoke {
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
        return IFeeManager(__getHub().feeManager());
    }

    function __getHub() internal view returns (IHub) {
        return IHub(HUB);
    }

    function __getPolicyManager() internal view returns (IPolicyManager) {
        return IPolicyManager(__getHub().policyManager());
    }

    function __getPriceSource() internal view returns (IPriceSource) {
        return IPriceSource(__getRegistry().priceSource());
    }

    function __getRegistry() internal view returns (IRegistry) {
        return IRegistry(__getHub().REGISTRY());
    }

    function __getShares() internal view returns (IShares) {
        return IShares(__getHub().shares());
    }

    function __getVault() internal view returns (IVault) {
        return IVault(__getHub().vault());
    }
}

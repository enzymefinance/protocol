pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "./Spoke.sol";

/// @title SpokeAccessor Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Inherit this contract to have access to the current Spoke
contract SpokeAccessor {
    modifier spokeInitialized() {
        require(ISpoke(address(this)).initialized(), "Spoke is not initialized");
        _;
    }

    function __getHub() internal view returns (IHub) {
        return ISpoke(address(this)).getHub();
    }

    function __getRoutes() internal view returns (IHub.Routes memory) {
        return Spoke(address(this)).getRoutes();
    }
}

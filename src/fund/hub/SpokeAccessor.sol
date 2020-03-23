pragma solidity 0.6.4;

import "./ISpoke.sol";

contract SpokeAccessor {
    modifier spokeInitialized() {
        require(ISpoke(address(this)).initialized(), "Spoke is not initialized");
        _;
    }

    function __getHub() internal view returns (IHub) {
        return ISpoke(address(this)).hub();
    }

    function __getRoutes() internal view returns (IHub.Routes memory) {
        return ISpoke(address(this)).routes();
    }
}

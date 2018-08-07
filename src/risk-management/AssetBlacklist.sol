pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";
import "./AssetList.sol";


// AssetBlacklist policy is run as a pre-condition
contract AssetBlacklist is AssetList, Policy {
    //The actual Risk Engineering Rule
    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        return !exists(addresses[3]);
    }
    
    function position() external view returns (uint) {
        return 0;
    }
}

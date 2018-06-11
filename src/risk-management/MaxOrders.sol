pragma solidity ^0.4.21;

import "../policies/Policy.sol";

contract MaxOrders is Policy {
    function rule(address[4] addresses, uint[2] values) external view returns (bool) {
        return true;
    }
}

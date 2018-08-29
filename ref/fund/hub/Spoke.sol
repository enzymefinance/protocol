pragma solidity ^0.4.21;


import "./Hub.sol";

/// @notice Has one Hub
contract Spoke {
    Hub public hub;
    
    function Spoke(address _hub) {
        hub = _hub;
    }
}


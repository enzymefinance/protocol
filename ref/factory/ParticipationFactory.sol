pragma solidity ^0.4.21;


import "./Factory.i.sol";
import "../fund/participation/Participation.sol";

contract ParticipationFactory is FactoryInterface {
    function createInstance(address _hub) public returns (address) {
        return new Participation(_hub);
    }
}


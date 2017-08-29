pragma solidity ^0.4.11;

import './SphereInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title Sphere Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Sphere Module.
contract Sphere is SphereInterface, DBC, Owned {

    // TYPES

    // FIELDS
    address public DATAFEED;
    address public EXCHANGE;

    // CONSTANT METHODS

    function getDataFeed() constant returns (address) { return DATAFEED; }
    function getExchange() constant returns (address) { return EXCHANGE; }

    // NON-CONSTANT METHODS

    function Sphere(address ofDataFeed, address ofExchange) {
        DATAFEED = ofDataFeed;
        EXCHANGE = ofExchange;
    }
}

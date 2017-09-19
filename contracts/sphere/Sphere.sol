pragma solidity ^0.4.15;

import './SphereInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title Sphere Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Sphere Module.
contract Sphere is SphereInterface, DBC, Owned {

    // FIELDS

    address public DATAFEED;
    address public CONSIGNED; // Assets can be transferred to this address
    address public EXCHANGE_ADAPTER;

    // CONSTANT METHODS

    function getDataFeed() external constant returns (address) { return DATAFEED; }
    function getConsigned() external constant returns (address) { return CONSIGNED; }
    function getExchangeAdapter() external constant returns (address) { return EXCHANGE_ADAPTER; }

    // NON-CONSTANT METHODS

    function Sphere(address ofDataFeed, address ofExchange, address ofExchangeAdapter) {
        DATAFEED = ofDataFeed;
        CONSIGNED = ofExchange;
        EXCHANGE_ADAPTER = ofExchangeAdapter;
    }
}

pragma solidity ^0.4.17;

import './SphereInterface.sol';
import '../dependencies/Owned.sol';


/// @title Sphere Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Sphere Module.
contract Sphere is SphereInterface, DBC, Owned {

    // TYPES

    enum SubSet { blockchainCustodian, externalCustodian } // Disjoint subsets of all spheres

    // FIELDS

    address public DATAFEED;
    address public EXCHANGE; // Assets can be transferred to this address
    address public EXCHANGE_ADAPTER;
    SubSet public SUBSET; // Using decentralised exchange: Not staked; Using centralised exchange: Staked

    // CONSTANT METHODS

    function getPriceFeed() external constant returns (address) { return DATAFEED; }
    function getExchange() external constant returns (address) { return EXCHANGE; }
    function getExchangeAdapter() external constant returns (address) { return EXCHANGE_ADAPTER; }
    function ofSubSet() external constant returns (uint) { return uint(SUBSET); }

    // NON-CONSTANT METHODS

    function Sphere(address ofPriceFeed, address ofExchange) {
        DATAFEED = ofPriceFeed;
        EXCHANGE = ofExchange;
    }
}

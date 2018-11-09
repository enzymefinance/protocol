pragma solidity ^0.4.21;

/// @notice Returns values of various assets
interface PriceSource {
    function getPrice(address quote) view returns (uint, uint);

    // TODO: consider making interface for the below methods
    // function getPriceForPair(address base, address quote) view returns (uint);
    // function getPricesAgainstBase(address base, address[] quotes) view returns (uint[]);
}

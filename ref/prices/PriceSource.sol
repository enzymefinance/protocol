pragma solidity ^0.4.21;

/// @notice Returns values of various assets
interface PriceSource {
    function getPriceForPair(address base, address quote) view returns (uint);
    function getPricesAgainstBase(address base, address[] quotes) view returns (uint[]);
}

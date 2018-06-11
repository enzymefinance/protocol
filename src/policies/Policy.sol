pragma solidity ^0.4.21;

interface Policy {
    /// @param addresses: Order maker, Order taker, Order maker asset and Order taker asset.
    /// @param values Maker token quantity and Taker token quantity.
    function rule(address[4] addresses, uint[2] values) external view returns (bool);
}

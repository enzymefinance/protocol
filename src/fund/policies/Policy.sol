pragma solidity ^0.4.21;

interface Policy {
    /// addresses: Order maker, Order taker, Order maker asset and Order taker asset.
    /// values Maker token quantity and Taker token quantity.
    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool);

    // 0. pre-condition, 1. post-condition.
    function position() external view returns (uint);
}

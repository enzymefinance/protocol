pragma solidity ^0.4.21;

contract Policy {
    enum Applied { pre, post }

    // In Trading context:
    // addresses: Order maker, Order taker, Order maker asset, Order taker asset, Exchange address
    // values: Maker token quantity, Taker token quantity, Fill Taker Quantity

    // In Participation context:
    // address[0]: Investor address, address[3]: Investment asset
    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool);

    function position() external view returns (Applied);
}

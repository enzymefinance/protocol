pragma solidity ^0.4.21;

// TODO: change back to interface when upgraded to solidity 0.5
contract Policy {
    enum Applied { pre, post }

    /// addresses: Order maker, Order taker, Order maker asset and Order taker asset.
    /// values Maker token quantity and Taker token quantity.
    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool);

    function position() external view returns (Applied);
}

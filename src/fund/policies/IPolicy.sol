pragma solidity 0.6.1;

interface IPolicy {
    enum Applied { pre, post }

    // In Trading context:
    // addresses: Order maker, Order taker, Order maker asset, Order taker asset, Exchange address
    // values: Maker token quantity, Taker token quantity, Fill Taker Quantity

    // In Participation context:
    // address[0]: Investor address, address[3]: Investment asset
    function rule(bytes4 sig, address[5] calldata addresses, uint[3] calldata values, bytes32 identifier) external returns (bool);

    function position() external view returns (Applied);
    function identifier() external view returns (string memory);
}

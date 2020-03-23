pragma solidity 0.6.4;

interface IPolicy {
    enum Applied { pre, post }

    function identifier() external view returns (string memory);
    function position() external view returns (Applied);

    // In Trading context:
    // addresses: Order maker, Order taker, Order maker asset, Order taker asset, Exchange address
    // values: Maker token quantity, Taker token quantity, Fill Taker Quantity

    // In Participation context:
    // address[0]: Investor address, address[3]: Investment asset
    function rule(bytes4, address[5] calldata, uint[3] calldata, bytes32) external returns (bool);
}

pragma solidity ^0.5.13;

interface FeeManagerFactoryInterface {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] calldata _fees,
        uint[] calldata _feeRates,
        uint[] calldata _feePeriods,
        address _registry
    ) external returns (address);
}

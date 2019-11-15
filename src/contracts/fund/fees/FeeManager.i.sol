pragma solidity ^0.4.25;

interface FeeManagerFactoryInterface {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] _fees,
        uint[] _feeRates,
        uint[] _feePeriods,
        address _registry
    ) public returns (address);
}

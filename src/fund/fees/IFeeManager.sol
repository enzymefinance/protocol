pragma solidity 0.6.1;

interface IFeeManagerFactory {
    function createInstance(
        address _hub,
        address _denominationAsset,
        address[] calldata _fees,
        uint[] calldata _feeRates,
        uint[] calldata _feePeriods,
        address _registry
    ) external returns (address);
}

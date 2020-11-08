// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../release/infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";

contract MockDerivativePriceFeed is IDerivativePriceFeed {
    mapping(address => uint256[]) private derivativeToRates;
    mapping(address => address[]) private derivativeToUnderlyings;
    mapping(address => bool) private derivativeToSupported;

    constructor(address[] memory _derivatives) public {
        for (uint256 i = 0; i < _derivatives.length; i++) {
            setIsSupportedAsset(_derivatives[i], true);
        }
    }

    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        underlyings_ = derivativeToUnderlyings[_derivative];
        rates_ = derivativeToRates[_derivative];
    }

    function setRatesToUnderlyings(
        address _derivative,
        uint256[] calldata _rates,
        address[] calldata _underlyings
    ) external {
        derivativeToRates[_derivative] = _rates;
        derivativeToUnderlyings[_derivative] = _underlyings;
    }

    function isSupportedAsset(address _derivative) external view override returns (bool) {
        return derivativeToSupported[_derivative];
    }

    function setIsSupportedAsset(address _derivative, bool _isSupported) public returns (bool) {
        derivativeToSupported[_derivative] = _isSupported;
    }
}

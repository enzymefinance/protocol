// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../release/infrastructure/price-feeds/derivatives/IDerivativePriceFeed.sol";

contract MockDerivativePriceFeed is IDerivativePriceFeed {
    mapping(address => RatesToUnderlyings) private derivativeToRatesToUnderlyings;
    mapping(address => bool) private derivativeToSupported;

    struct RatesToUnderlyings {
        uint256[] rates;
        address[] underlyings;
    }

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
        underlyings_ = derivativeToRatesToUnderlyings[_derivative].underlyings;
        rates_ = derivativeToRatesToUnderlyings[_derivative].rates;
    }

    function setRatesToUnderlyings(
        address _derivative,
        uint256[] calldata _rates,
        address[] calldata _underlyings
    ) external {
        derivativeToRatesToUnderlyings[_derivative] = RatesToUnderlyings({
            rates: _rates,
            underlyings: _underlyings
        });
    }

    function isSupportedAsset(address _derivative) external view override returns (bool) {
        return derivativeToSupported[_derivative];
    }

    function setIsSupportedAsset(address _derivative, bool _isSupported) public returns (bool) {
        derivativeToSupported[_derivative] = _isSupported;
    }
}

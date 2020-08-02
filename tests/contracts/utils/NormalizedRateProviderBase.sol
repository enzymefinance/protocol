// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./RateProviderBase.sol";

abstract contract NormalizedRateProviderBase is RateProviderBase {
    using SafeMath for uint256;

    uint256 immutable public RATE_PRECISION;

    constructor(
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    )
        public
        RateProviderBase(_specialAssets, _specialAssetDecimals)
    {
        RATE_PRECISION = _ratePrecision;
    }

    // TODO: move to main contracts' utils for use with prices
    function __calcDenormalizedQuoteAssetAmount(
        uint256 _baseAssetDecimals,
        uint256 _baseAssetAmount,
        uint256 _quoteAssetDecimals,
        uint256 _rate
    )
        internal
        view
        returns (uint256)
    {
        return _rate
            .mul(_baseAssetAmount)
            .mul(10 ** _quoteAssetDecimals)
            .div(10 ** (RATE_PRECISION.add(_baseAssetDecimals)));
    }

    function __getRate(address _baseAsset, address _quoteAsset) internal view returns (uint256) {
        // 1. Return constant if base asset is quote asset
        if (_baseAsset == _quoteAsset) {
            return 10 ** RATE_PRECISION;
        }

        // 2. Check for a direct rate
        uint256 directRate = assetToAssetRate[_baseAsset][_quoteAsset];
        if (directRate > 0) {
            return directRate;
        }

        // 3. Check for inverse direct rate
        uint256 iDirectRate = assetToAssetRate[_quoteAsset][_baseAsset];
        if (iDirectRate > 0) {
            return 10 ** (RATE_PRECISION.mul(2)).div(iDirectRate);
        }

        // 4. Else return 1
        return 10 ** RATE_PRECISION;
    }
}

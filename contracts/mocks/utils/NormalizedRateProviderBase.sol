// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./RateProviderBase.sol";

abstract contract NormalizedRateProviderBase is RateProviderBase {
    using SafeMath for uint256;

    uint256 public immutable RATE_PRECISION;

    constructor(
        address[] memory _defaultRateAssets,
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    ) public RateProviderBase(_specialAssets, _specialAssetDecimals) {
        RATE_PRECISION = _ratePrecision;

        for (uint256 i = 0; i < _defaultRateAssets.length; i++) {
            for (uint256 j = i + 1; j < _defaultRateAssets.length; j++) {
                assetToAssetRate[_defaultRateAssets[i]][_defaultRateAssets[j]] =
                    10**_ratePrecision;
                assetToAssetRate[_defaultRateAssets[j]][_defaultRateAssets[i]] =
                    10**_ratePrecision;
            }
        }
    }

    // TODO: move to main contracts' utils for use with prices
    function __calcDenormalizedQuoteAssetAmount(
        uint256 _baseAssetDecimals,
        uint256 _baseAssetAmount,
        uint256 _quoteAssetDecimals,
        uint256 _rate
    ) internal view returns (uint256) {
        return
            _rate.mul(_baseAssetAmount).mul(10**_quoteAssetDecimals).div(
                10**(RATE_PRECISION.add(_baseAssetDecimals))
            );
    }
}

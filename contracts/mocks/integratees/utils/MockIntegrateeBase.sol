// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../utils/NormalizedRateProviderBase.sol";
import "../../utils/SwapperBase.sol";

abstract contract MockIntegrateeBase is NormalizedRateProviderBase, SwapperBase {
    constructor(
        address[] memory _defaultRateAssets,
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    )
        public
        NormalizedRateProviderBase(
            _defaultRateAssets,
            _specialAssets,
            _specialAssetDecimals,
            _ratePrecision
        )
    {}

    function __getRate(address _baseAsset, address _quoteAsset)
        internal
        view
        override
        returns (uint256)
    {
        // 1. Return constant if base asset is quote asset
        if (_baseAsset == _quoteAsset) {
            return 10**RATE_PRECISION;
        }

        // 2. Check for a direct rate
        uint256 directRate = assetToAssetRate[_baseAsset][_quoteAsset];
        if (directRate > 0) {
            return directRate;
        }

        // 3. Check for inverse direct rate
        uint256 iDirectRate = assetToAssetRate[_quoteAsset][_baseAsset];
        if (iDirectRate > 0) {
            return 10**(RATE_PRECISION.mul(2)).div(iDirectRate);
        }

        // 4. Else return 1
        return 10**RATE_PRECISION;
    }
}

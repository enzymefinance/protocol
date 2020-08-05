// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../utils/NormalizedRateProviderBase.sol";

abstract contract MockIntegrateeBase is NormalizedRateProviderBase {
    constructor(
        address[] memory _defaultRateAssets,
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    )
        public
        NormalizedRateProviderBase(_defaultRateAssets, _specialAssets, _specialAssetDecimals, _ratePrecision)
    {}

    function __getRate(address _baseAsset, address _quoteAsset)
        internal
        view
        override
        returns (uint256)
    {
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

    function __swap(
        address payable _trader,
        address[] memory _assetsToIntegratee,
        uint256[] memory _assetsToIntegrateeAmounts,
        address[] memory _assetsFromIntegratee,
        uint256[] memory _assetsFromIntegrateeAmounts
    )
        internal
    {
        // Take custody of incoming assets
        for (uint256 i = 0; i < _assetsToIntegratee.length; i++) {
            address asset = _assetsToIntegratee[i];
            uint256 amount = _assetsToIntegrateeAmounts[i];
            require(asset != address(0), "__swap: empty value in _assetsToIntegratee");
            require(amount > 0, "__swap: empty value in _assetsToIntegrateeAmounts");
            // Incoming ETH amounts can be ignored
            if (asset == ETH_ADDRESS) {
                continue;
            }
            ERC20(asset).transferFrom(_trader, address(this), amount);
        }

        // Distribute outgoing assets
        for (uint256 i = 0; i < _assetsFromIntegratee.length; i++) {
            address asset = _assetsFromIntegratee[i];
            uint256 amount = _assetsFromIntegrateeAmounts[i];
            require(asset != address(0), "__swap: empty value in _assetsFromIntegratee");
            require(amount > 0, "__swap: empty value in _assetsFromIntegrateeAmounts");
            if (asset == ETH_ADDRESS) {
                _trader.transfer(amount);
            }
            else {
                ERC20(asset).transfer(_trader, amount);
            }   
        }
    }

    function __getRateAndSwapAssets(
        address payable _trader,
        address _srcToken,
        uint256 _srcAmount,
        address _destToken
    )
        internal
        returns (uint256 destAmount_)
    {
        uint256 actualRate = __getRate(_srcToken, _destToken);

        address[] memory assetsToIntegratee = new address[](1);
        assetsToIntegratee[0] = _srcToken;
        uint256[] memory assetsToIntegrateeAmounts = new uint256[](1);
        assetsToIntegrateeAmounts[0] = _srcAmount;

        address[] memory assetsFromIntegratee = new address[](1);
        assetsFromIntegratee[0] = _destToken;
        uint256[] memory assetsFromIntegrateeAmounts = new uint256[](1);
        assetsFromIntegrateeAmounts[0] = __calcDenormalizedQuoteAssetAmount(
            __getDecimalsForAsset(_srcToken),
            _srcAmount,
            __getDecimalsForAsset(_destToken),
            actualRate
        );

        __swap(
            _trader,
            assetsToIntegratee,
            assetsToIntegrateeAmounts,
            assetsFromIntegratee,
            assetsFromIntegrateeAmounts
        );

        return assetsFromIntegrateeAmounts[0];
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./MockIntegrateeBase.sol";

abstract contract SimpleMockIntegrateeBase is MockIntegrateeBase {
    constructor(
        address[] memory _defaultRateAssets,
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    )
        public
        MockIntegrateeBase(_defaultRateAssets, _specialAssets, _specialAssetDecimals, _ratePrecision)
    {}

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

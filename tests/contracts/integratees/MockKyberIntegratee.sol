// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./utils/MockIntegrateeBase.sol";

// TODO: revert if minRate is not met? Or allow it to be ignored? Use same revert as Kyber?
contract MockKyberIntegratee is MockIntegrateeBase {
    function swapEtherToToken(address _destToken, uint256 _minRate)
        external
        payable
        returns (uint256)
    {
        return __validateRateAndSwapAssets(
            ETH_ADDRESS,
            msg.value,
            _destToken,
            _minRate
        );
    }

    function swapTokenToEther(address _srcToken, uint256 _srcAmount, uint256 _minRate)
        external
        returns (uint256)
    {
        return __validateRateAndSwapAssets(
            _srcToken,
            _srcAmount,
            ETH_ADDRESS,
            _minRate
        );
    }

    function swapTokenToToken(
        address _srcToken,
        uint256 _srcAmount,
        address _destToken,
        uint256 _minRate
    )
        external
        returns (uint256)
    {
        return __validateRateAndSwapAssets(
            _srcToken,
            _srcAmount,
            _destToken,
            _minRate
        );
    }

    function __validateRateAndSwapAssets(
        address _srcToken,
        uint256 _srcAmount,
        address _destToken,
        uint256 _minRate
    )
        private
        returns (uint256 destAmount_)
    {
        uint256 actualRate = __getRate(_srcToken, _destToken);
        // TODO: revert message should be empty or same as Kyber's?
        require(_minRate >= actualRate);

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
            assetsToIntegratee,
            assetsToIntegrateeAmounts,
            assetsFromIntegratee,
            assetsFromIntegrateeAmounts
        );

        return assetsFromIntegrateeAmounts[0];
    }
}

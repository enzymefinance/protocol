// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./MockIntegrateeBase.sol";

abstract contract SimpleMockIntegrateeBase is MockIntegrateeBase {
    constructor(
        address[] memory _defaultRateAssets,
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    )
        public
        MockIntegrateeBase(
            _defaultRateAssets,
            _specialAssets,
            _specialAssetDecimals,
            _ratePrecision
        )
    {}

    function __getRateAndSwapAssets(
        address payable _trader,
        address _srcToken,
        uint256 _srcAmount,
        address _destToken
    ) internal returns (uint256 destAmount_) {
        uint256 actualRate = __getRate(_srcToken, _destToken);
        __swapAssets(_trader, _srcToken, _srcAmount, _destToken, actualRate);
        return actualRate;
    }
}

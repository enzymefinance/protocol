// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/NormalizedRateProviderBase.sol";

contract MockKyberPriceSource is NormalizedRateProviderBase {
    uint256 constant public MOCK_SLIPPAGE_RATE = 97 * 10 ** 16;

    constructor(address[] memory _defaultRateAssets)
        public
        NormalizedRateProviderBase(_defaultRateAssets, new address[](0), new uint8[](0), 18)
    {}

    function getExpectedRate(address _baseAsset, address _quoteAsset, uint256)
        external
        view
        returns (uint256, uint256)
    {
        uint256 rate = __getRate(_baseAsset, _quoteAsset);
        uint256 slippageRate = rate.mul(MOCK_SLIPPAGE_RATE).div(RATE_PRECISION);

        return (rate, slippageRate);
    }
}

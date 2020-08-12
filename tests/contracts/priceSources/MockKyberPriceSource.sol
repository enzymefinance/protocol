// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/NormalizedRateProviderBase.sol";

contract MockKyberPriceSource is NormalizedRateProviderBase {
    uint256 public constant MOCK_SLIPPAGE_RATE = 97 * 10**16;
    address public immutable WETH_ADDRESS;

    constructor(address[] memory _defaultRateAssets, address _wethAddress)
        public
        NormalizedRateProviderBase(_defaultRateAssets, new address[](0), new uint8[](0), 18)
    {
        WETH_ADDRESS = _wethAddress;
    }

    function getExpectedRate(
        address _baseAsset,
        address _quoteAsset,
        uint256
    ) external view returns (uint256, uint256) {
        uint256 rate = __getRate(
            __getReverseKyberMaskAsset(_baseAsset),
            __getReverseKyberMaskAsset(_quoteAsset)
        );
        uint256 slippageRate = rate.mul(MOCK_SLIPPAGE_RATE).div(RATE_PRECISION);

        return (rate, slippageRate);
    }

    function __getReverseKyberMaskAsset(address _asset) private view returns (address) {
        if (_asset == address(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)) {
            return WETH_ADDRESS;
        }
        return _asset;
    }
}

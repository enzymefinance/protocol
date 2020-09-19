// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/release/contracts/interfaces/IERC20Extended.sol";
import "./EthConstantMixin.sol";

abstract contract RateProviderBase is EthConstantMixin {
    mapping(address => mapping(address => uint256)) public assetToAssetRate;

    // Handles non-ERC20 compliant assets like ETH and USD
    mapping(address => uint8) public specialAssetToDecimals;

    constructor(address[] memory _specialAssets, uint8[] memory _specialAssetDecimals) public {
        require(
            _specialAssets.length == _specialAssetDecimals.length,
            "constructor: _specialAssets and _specialAssetDecimals are uneven lengths"
        );
        for (uint256 i = 0; i < _specialAssets.length; i++) {
            specialAssetToDecimals[_specialAssets[i]] = _specialAssetDecimals[i];
        }

        specialAssetToDecimals[ETH_ADDRESS] = 18;
    }

    function __getDecimalsForAsset(address _asset) internal view returns (uint256) {
        uint256 decimals = specialAssetToDecimals[_asset];
        if (decimals == 0) {
            decimals = uint256(IERC20Extended(_asset).decimals());
        }

        return decimals;
    }

    function __getRate(address _baseAsset, address _quoteAsset)
        internal
        virtual
        view
        returns (uint256)
    {
        return assetToAssetRate[_baseAsset][_quoteAsset];
    }

    function setRates(
        address[] calldata _baseAssets,
        address[] calldata _quoteAssets,
        uint256[] calldata _rates
    ) external {
        require(
            _baseAssets.length == _quoteAssets.length,
            "setRates: _baseAssets and _quoteAssets are uneven lengths"
        );
        require(
            _baseAssets.length == _rates.length,
            "setRates: _baseAssets and _rates are uneven lengths"
        );
        for (uint256 i = 0; i < _baseAssets.length; i++) {
            assetToAssetRate[_baseAssets[i]][_quoteAssets[i]] = _rates[i];
        }
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
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
            decimals = uint256(ERC20(_asset).decimals());
        }

        return decimals;
    }

    function __getRate(address _baseAsset, address _quoteAsset)
        internal
        view
        virtual
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

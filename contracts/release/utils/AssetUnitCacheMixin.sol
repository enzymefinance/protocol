// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AssetUnitCacheMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin to store a cache of asset units
abstract contract AssetUnitCacheMixin {
    event AssetUnitCached(address indexed asset, uint256 prevUnit, uint256 nextUnit);

    mapping(address => uint256) private assetToUnit;

    /// @notice Caches the decimal-relative unit for a given asset
    /// @param _asset The asset for which to cache the decimal-relative unit
    /// @dev Callable by any account
    function cacheAssetUnit(address _asset) public {
        uint256 prevUnit = getCachedUnitForAsset(_asset);
        uint256 nextUnit = 10**uint256(ERC20(_asset).decimals());
        if (nextUnit != prevUnit) {
            assetToUnit[_asset] = nextUnit;
            emit AssetUnitCached(_asset, prevUnit, nextUnit);
        }
    }

    /// @notice Caches the decimal-relative units for multiple given assets
    /// @param _assets The assets for which to cache the decimal-relative units
    /// @dev Callable by any account
    function cacheAssetUnits(address[] memory _assets) public {
        for (uint256 i; i < _assets.length; i++) {
            cacheAssetUnit(_assets[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the cached decimal-relative unit for a given asset
    /// @param _asset The asset for which to get the cached decimal-relative unit
    /// @return unit_ The cached decimal-relative unit
    function getCachedUnitForAsset(address _asset) public view returns (uint256 unit_) {
        return assetToUnit[_asset];
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../utils/NormalizedRateProviderBase.sol";

abstract contract MockIntegrateeBase is NormalizedRateProviderBase {

    constructor(
        address[] memory _specialAssets,
        uint8[] memory _specialAssetDecimals,
        uint256 _ratePrecision
    )
        public
        NormalizedRateProviderBase(_specialAssets, _specialAssetDecimals, _ratePrecision)
    {}

    function __swap(
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
            ERC20(asset).transferFrom(msg.sender, address(this), amount);
        }

        // Distribute outgoing assets
        for (uint256 i = 0; i < _assetsFromIntegratee.length; i++) {
            address asset = _assetsFromIntegratee[i];
            uint256 amount = _assetsFromIntegrateeAmounts[i];
            require(asset != address(0), "__swap: empty value in _assetsFromIntegratee");
            require(amount > 0, "__swap: empty value in _assetsFromIntegrateeAmounts");
            if (asset == ETH_ADDRESS) {
                msg.sender.transfer(amount);
            }
            else {
                ERC20(asset).transfer(msg.sender, amount);
            }   
        }
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

abstract contract MockIntegrateeBase {
    using SafeMath for uint256;

    address constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 constant ETH_DECIMALS = 18;
    uint256 constant RATE_NORMALIZATION_DECIMALS = 18;

    mapping (address => mapping(address => uint256)) assetToAssetRate;

    function setRate(address _baseAsset, address _quoteAsset, uint256 _rate) external {
        assetToAssetRate[_baseAsset][_quoteAsset] = _rate;
    }

    function __calcDenormalizedQuoteAssetAmount(
        uint256 _baseAssetDecimals,
        uint256 _baseAssetAmount,
        uint256 _quoteAssetDecimals,
        uint256 _rate
    )
        internal
        pure
        returns (uint256)
    {
        return _rate.mul(_baseAssetAmount).div(
            10 ** (RATE_NORMALIZATION_DECIMALS.add(_baseAssetDecimals).sub(_quoteAssetDecimals))
        );
    }

    function __getDecimalsForAsset(address _asset) internal view returns (uint256) {
        if (_asset == ETH_ADDRESS) {
            return ETH_DECIMALS;
        }    
        return uint256(ERC20(_asset).decimals());
    }

    function __getRate(address _baseAsset, address _quoteAsset) internal view returns (uint256) {
        if (_baseAsset == _quoteAsset) {
            return 10 ** RATE_NORMALIZATION_DECIMALS;
        }

        // 1. Check for a direct rate
        uint256 directRate = assetToAssetRate[_baseAsset][_quoteAsset];
        if (directRate > 0) {
            return directRate;
        }

        // 2. Check for inverse direct rate
        uint256 iDirectRate = assetToAssetRate[_quoteAsset][_baseAsset];
        if (iDirectRate > 0) {
            return 10 ** (RATE_NORMALIZATION_DECIMALS.mul(2)).div(iDirectRate);
        }

        // 4. Else return 1
        return 10 ** RATE_NORMALIZATION_DECIMALS;
    }

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

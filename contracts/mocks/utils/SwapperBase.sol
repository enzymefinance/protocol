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

abstract contract SwapperBase is EthConstantMixin {
    receive() external payable {}

    function __swapAssets(
        address payable _trader,
        address _srcToken,
        uint256 _srcAmount,
        address _destToken,
        uint256 _actualRate
    ) internal returns (uint256 destAmount_) {
        address[] memory assetsToIntegratee = new address[](1);
        assetsToIntegratee[0] = _srcToken;
        uint256[] memory assetsToIntegrateeAmounts = new uint256[](1);
        assetsToIntegrateeAmounts[0] = _srcAmount;

        address[] memory assetsFromIntegratee = new address[](1);
        assetsFromIntegratee[0] = _destToken;
        uint256[] memory assetsFromIntegrateeAmounts = new uint256[](1);
        assetsFromIntegrateeAmounts[0] = _actualRate;
        __swap(
            _trader,
            assetsToIntegratee,
            assetsToIntegrateeAmounts,
            assetsFromIntegratee,
            assetsFromIntegrateeAmounts
        );

        return assetsFromIntegrateeAmounts[0];
    }

    function __swap(
        address payable _trader,
        address[] memory _assetsToIntegratee,
        uint256[] memory _assetsToIntegrateeAmounts,
        address[] memory _assetsFromIntegratee,
        uint256[] memory _assetsFromIntegrateeAmounts
    ) internal {
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
            ERC20(asset).transferFrom(_trader, address(this), amount);
        }

        // Distribute outgoing assets
        for (uint256 i = 0; i < _assetsFromIntegratee.length; i++) {
            address asset = _assetsFromIntegratee[i];
            uint256 amount = _assetsFromIntegrateeAmounts[i];
            require(asset != address(0), "__swap: empty value in _assetsFromIntegratee");
            require(amount > 0, "__swap: empty value in _assetsFromIntegrateeAmounts");
            if (asset == ETH_ADDRESS) {
                _trader.transfer(amount);
            } else {
                ERC20(asset).transfer(_trader, amount);
            }
        }
    }
}

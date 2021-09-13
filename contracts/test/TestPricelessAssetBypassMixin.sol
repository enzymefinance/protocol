// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/extensions/policy-manager/policies/utils/PricelessAssetBypassMixin.sol";

/// @title TestPricelessAssetBypassMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test implementation of PricelessAssetBypassMixin
contract TestPricelessAssetBypassMixin is PricelessAssetBypassMixin {
    constructor(
        address _valueInterpreter,
        address _wethToken,
        uint256 _timelock,
        uint256 _timeLimit
    ) public PricelessAssetBypassMixin(_valueInterpreter, _wethToken, _timelock, _timeLimit) {}

    function calcTotalValueExlcudingBypassablePricelessAssets(
        address _comptrollerProxy,
        address[] memory _baseAssets,
        uint256[] memory _baseAssetAmounts,
        address _quoteAsset
    ) external returns (uint256 value_) {
        return
            __calcTotalValueExlcudingBypassablePricelessAssets(
                _comptrollerProxy,
                _baseAssets,
                _baseAssetAmounts,
                _quoteAsset
            );
    }

    function calcValueExcludingBypassablePricelessAsset(
        address _comptrollerProxy,
        address _baseAsset,
        uint256 _baseAssetAmount,
        address _quoteAsset
    ) external returns (uint256 value_) {
        return
            __calcValueExcludingBypassablePricelessAsset(
                _comptrollerProxy,
                _baseAsset,
                _baseAssetAmount,
                _quoteAsset
            );
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title MathHelpers Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Helper functions for common math operations
abstract contract MathHelpers {
    using SafeMath for uint256;

    /// @dev Calculates a proportional value relative to a known ratio
    function __calcRelativeQuantity(
        uint256 _quantity1,
        uint256 _quantity2,
        uint256 _relativeQuantity1
    ) internal pure returns (uint256 relativeQuantity2_) {
        return _relativeQuantity1.mul(_quantity2).div(_quantity1);
    }

    /// @dev Calculates a rate normalized to 10^18 precision,
    /// for given base and quote asset decimals and amounts
    function __calcNormalizedRate(
        uint256 _baseAssetDecimals,
        uint256 _baseAssetAmount,
        uint256 _quoteAssetDecimals,
        uint256 _quoteAssetAmount
    ) internal pure returns (uint256 normalizedRate_) {
        return
            _quoteAssetAmount.mul(10**_baseAssetDecimals.add(18)).div(
                _baseAssetAmount.mul(10**_quoteAssetDecimals)
            );
    }
}

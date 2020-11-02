// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title MathHelpers Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Helper function for common math operations
contract MathHelpers {
    using SafeMath for uint256;

    /// @dev Calculates a proportional value relative to a known ratio.
    /// For use in calculating a missing expected fill amount
    /// based on an asset pair's price
    function __calcRelativeQuantity(
        uint256 _quantity1,
        uint256 _quantity2,
        uint256 _relativeQuantity1
    ) internal pure returns (uint256 relativeQuantity2_) {
        if (_quantity1 == _relativeQuantity1) {
            return _quantity2;
        }

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

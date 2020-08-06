// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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
    )
        internal
        pure
        returns (uint256 relativeQuantity2_)
    {
        relativeQuantity2_ = _relativeQuantity1.mul(_quantity2).div(_quantity1);
    }

    /// @dev Calculates a rate for a given base asset to any other asset using given amounts
    function __calcRate(
        address _baseAsset,
        uint256 _baseAssetAmount,
        uint256 _quoteAssetAmount
    )
        internal
        view
        returns (uint256)
    {
        return _quoteAssetAmount.mul(10 ** uint256(ERC20(_baseAsset).decimals())).div(_baseAssetAmount);
    }
}

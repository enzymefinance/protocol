// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title MathHelpers Library
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Helper functions for common math operations
library MathHelpersLib {
    /// @dev Calculates a proportional value relative to a known ratio.
    /// Caller is responsible as-necessary for:
    /// 1. validating _quantity1 to be non-zero
    /// 2. validating relativeQuantity2_ to be non-zero
    function calcRelativeQuantity(uint256 _quantity1, uint256 _quantity2, uint256 _relativeQuantity1)
        internal
        pure
        returns (uint256 relativeQuantity2_)
    {
        return _relativeQuantity1 * _quantity2 / _quantity1;
    }

    /// @dev Helper to subtract uint amounts, but returning zero on underflow instead of reverting
    function subOrZero(uint256 _amountA, uint256 _amountB) internal pure returns (uint256 res_) {
        if (_amountA > _amountB) {
            unchecked {
                return _amountA - _amountB;
            }
        }

        return 0;
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title SharesInflationMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract mixin contract for calculating shares for fees, taking inflation into account
abstract contract SharesInflationMixin {
    using SafeMath for uint256;

    /// @dev Helper to calculate shares due for fees, taking inflation into account (positive shares due).
    /// Note that this calculation does not handle cases where _rawSharesDue >= _sharesSupply.
    /// This is a known limitation that is extremely unlikely to be reached with the official fees
    /// that use this formula, but 3rd parties should consider the implications if used in their
    /// own fee contracts.
    function __calcSharesDueWithInflation(uint256 _rawSharesDue, uint256 _sharesSupply)
        internal
        pure
        returns (uint256 sharesDue_)
    {
        if (_rawSharesDue == 0 || _sharesSupply == 0 || _rawSharesDue >= _sharesSupply) {
            return 0;
        }
        return _rawSharesDue.mul(_sharesSupply).div(_sharesSupply.sub(_rawSharesDue));
    }
}

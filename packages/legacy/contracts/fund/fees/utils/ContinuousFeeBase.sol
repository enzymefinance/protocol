// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "./FeeBase.sol";

/// @title ContinuousFeeBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Abstract base contract for Continuous fees
abstract contract ContinuousFeeBase is FeeBase {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    constructor(address _registry) public FeeBase(_registry) {}

    /// @notice Provides a constant string identifier for a policy
    function feeHook() external override view returns (IFeeManager.FeeHook) {
        return IFeeManager.FeeHook.Continuous;
    }

    /// @dev Helper to calculate shares due, taking deflation into account (negative shares due)
    function __calcSharesDueWithInflation(int256 _rawSharesDue, int256 _sharesSupply)
        internal
        pure
        returns (int256)
    {
        if (_rawSharesDue == 0 || _sharesSupply == 0) {
            return 0;
        }
        return _rawSharesDue.mul(_sharesSupply).div(_sharesSupply.sub(_rawSharesDue));
    }

    /// @dev Helper to calculate shares due, taking inflation into account (positive shares due)
    function __calcSharesDueWithInflation(uint256 _rawSharesDue, uint256 _sharesSupply)
        internal
        pure
        returns (uint256)
    {
        if (_rawSharesDue == 0 || _sharesSupply == 0) {
            return 0;
        }
        return _rawSharesDue.mul(_sharesSupply).div(_sharesSupply.sub(_rawSharesDue));
    }
}

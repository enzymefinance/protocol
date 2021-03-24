// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../../interfaces/ICurveStableSwapAave.sol";

/// @title CurveAaveLiquidityActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Curve Aave pool's liquidity functions
abstract contract CurveAaveLiquidityActionsMixin {
    using SafeERC20 for ERC20;

    address private immutable CURVE_AAVE_LIQUIDITY_POOL;

    constructor(
        address _pool,
        address[3] memory _aaveTokensToApprove,
        address[3] memory _underlyingTokensToApprove
    ) public {
        CURVE_AAVE_LIQUIDITY_POOL = _pool;

        // Pre-approve pool to use max of each aToken and underlying,
        // as specified by the inheriting contract.
        // Use address(0) to skip a particular ordered asset.
        for (uint256 i; i < 3; i++) {
            if (_aaveTokensToApprove[i] != address(0)) {
                ERC20(_aaveTokensToApprove[i]).safeApprove(_pool, type(uint256).max);
            }
            if (_underlyingTokensToApprove[i] != address(0)) {
                ERC20(_underlyingTokensToApprove[i]).safeApprove(_pool, type(uint256).max);
            }
        }
    }

    /// @dev Helper to add liquidity to the pool.
    /// _orderedOutgoingAssetAmounts = [aDAI, aUSDC, aUSDT].
    function __curveAaveLend(
        uint256[3] memory _orderedOutgoingAssetAmounts,
        uint256 _minIncomingLPTokenAmount,
        bool _useUnderlyings
    ) internal {
        ICurveStableSwapAave(CURVE_AAVE_LIQUIDITY_POOL).add_liquidity(
            _orderedOutgoingAssetAmounts,
            _minIncomingLPTokenAmount,
            _useUnderlyings
        );
    }

    /// @dev Helper to remove liquidity from the pool.
    /// if using _redeemSingleAsset, must pre-validate that one - and only one - asset
    /// has a non-zero _orderedMinIncomingAssetAmounts value.
    /// _orderedOutgoingAssetAmounts = [aDAI, aUSDC, aUSDT].
    function __curveAaveRedeem(
        uint256 _outgoingLPTokenAmount,
        uint256[3] memory _orderedMinIncomingAssetAmounts,
        bool _redeemSingleAsset,
        bool _useUnderlyings
    ) internal {
        if (_redeemSingleAsset) {
            // Assume that one - and only one - asset has a non-zero min incoming asset amount
            for (uint256 i; i < _orderedMinIncomingAssetAmounts.length; i++) {
                if (_orderedMinIncomingAssetAmounts[i] > 0) {
                    ICurveStableSwapAave(CURVE_AAVE_LIQUIDITY_POOL).remove_liquidity_one_coin(
                        _outgoingLPTokenAmount,
                        int128(i),
                        _orderedMinIncomingAssetAmounts[i],
                        _useUnderlyings
                    );
                    return;
                }
            }
        } else {
            ICurveStableSwapAave(CURVE_AAVE_LIQUIDITY_POOL).remove_liquidity(
                _outgoingLPTokenAmount,
                _orderedMinIncomingAssetAmounts,
                _useUnderlyings
            );
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_AAVE_LIQUIDITY_POOL` variable
    /// @return pool_ The `CURVE_AAVE_LIQUIDITY_POOL` variable value
    function getCurveAaveLiquidityPool() public view returns (address pool_) {
        return CURVE_AAVE_LIQUIDITY_POOL;
    }
}

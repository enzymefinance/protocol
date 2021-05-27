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
import "../../../../../interfaces/ICurveStableSwapEurs.sol";

/// @title CurveEursLiquidityActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Curve eurs pool's liquidity functions
/// @dev Inheriting contract must have a receive() function
abstract contract CurveEursLiquidityActionsMixin {
    using SafeERC20 for ERC20;

    int128 private constant CURVE_EURS_POOL_INDEX_EURS = 0;
    int128 private constant CURVE_EURS_POOL_INDEX_SEUR = 1;

    address private immutable CURVE_EURS_LIQUIDITY_POOL;

    constructor(
        address _pool,
        address _eursToken,
        address _seurToken
    ) public {
        CURVE_EURS_LIQUIDITY_POOL = _pool;

        // Pre-approve pool to use max of both tokens
        ERC20(_eursToken).safeApprove(_pool, type(uint256).max);
        ERC20(_seurToken).safeApprove(_pool, type(uint256).max);
    }

    /// @dev Helper to add liquidity to the pool
    function __curveEursLend(
        uint256 _outgoingEursAmount,
        uint256 _outgoingSeurAmount,
        uint256 _minIncomingLPTokenAmount
    ) internal {
        ICurveStableSwapEurs(CURVE_EURS_LIQUIDITY_POOL).add_liquidity(
            [_outgoingEursAmount, _outgoingSeurAmount],
            _minIncomingLPTokenAmount
        );
    }

    /// @dev Helper to remove liquidity from the pool.
    // Assumes that if _redeemSingleAsset is true, then
    // "_minIncomingEursAmount > 0 XOR _minIncomingSeurAmount > 0" has already been validated.
    function __curveEursRedeem(
        uint256 _outgoingLPTokenAmount,
        uint256 _minIncomingEursAmount,
        uint256 _minIncomingSeurAmount,
        bool _redeemSingleAsset
    ) internal {
        if (_redeemSingleAsset) {
            if (_minIncomingEursAmount > 0) {
                ICurveStableSwapEurs(CURVE_EURS_LIQUIDITY_POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    CURVE_EURS_POOL_INDEX_EURS,
                    _minIncomingEursAmount
                );
            } else {
                ICurveStableSwapEurs(CURVE_EURS_LIQUIDITY_POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    CURVE_EURS_POOL_INDEX_SEUR,
                    _minIncomingSeurAmount
                );
            }
        } else {
            ICurveStableSwapEurs(CURVE_EURS_LIQUIDITY_POOL).remove_liquidity(
                _outgoingLPTokenAmount,
                [_minIncomingEursAmount, _minIncomingSeurAmount]
            );
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_EURS_LIQUIDITY_POOL` variable
    /// @return pool_ The `CURVE_EURS_LIQUIDITY_POOL` variable value
    function getCurveEursLiquidityPool() public view returns (address pool_) {
        return CURVE_EURS_LIQUIDITY_POOL;
    }
}

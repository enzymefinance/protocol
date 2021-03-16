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
import "../../../../../interfaces/ICurveStableSwapSteth.sol";
import "../../../../../interfaces/IWETH.sol";

/// @title CurveStethLiquidityActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Curve steth pool's liquidity functions
/// @dev Inheriting contract must have a receive() function
abstract contract CurveStethLiquidityActionsMixin {
    using SafeERC20 for ERC20;

    int128 private constant CURVE_STETH_POOL_INDEX_ETH = 0;
    int128 private constant CURVE_STETH_POOL_INDEX_STETH = 1;

    address private immutable CURVE_STETH_LIQUIDITY_POOL;
    address private immutable CURVE_STETH_LIQUIDITY_WETH_TOKEN;

    constructor(
        address _pool,
        address _stethToken,
        address _wethToken
    ) public {
        CURVE_STETH_LIQUIDITY_POOL = _pool;
        CURVE_STETH_LIQUIDITY_WETH_TOKEN = _wethToken;

        // Pre-approve pool to use max of steth token
        ERC20(_stethToken).safeApprove(_pool, type(uint256).max);
    }

    /// @dev Helper to add liquidity to the pool
    function __curveStethLend(
        uint256 _outgoingWethAmount,
        uint256 _outgoingStethAmount,
        uint256 _minIncomingLPTokenAmount
    ) internal {
        if (_outgoingWethAmount > 0) {
            IWETH((CURVE_STETH_LIQUIDITY_WETH_TOKEN)).withdraw(_outgoingWethAmount);
        }

        ICurveStableSwapSteth(CURVE_STETH_LIQUIDITY_POOL).add_liquidity{
            value: _outgoingWethAmount
        }([_outgoingWethAmount, _outgoingStethAmount], _minIncomingLPTokenAmount);
    }

    /// @dev Helper to remove liquidity from the pool.
    // Assumes that if _redeemSingleAsset is true, then
    // "_minIncomingWethAmount > 0 XOR _minIncomingStethAmount > 0" has already been validated.
    function __curveStethRedeem(
        uint256 _outgoingLPTokenAmount,
        uint256 _minIncomingWethAmount,
        uint256 _minIncomingStethAmount,
        bool _redeemSingleAsset
    ) internal {
        if (_redeemSingleAsset) {
            if (_minIncomingWethAmount > 0) {
                ICurveStableSwapSteth(CURVE_STETH_LIQUIDITY_POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    CURVE_STETH_POOL_INDEX_ETH,
                    _minIncomingWethAmount
                );

                IWETH(payable(CURVE_STETH_LIQUIDITY_WETH_TOKEN)).deposit{
                    value: payable(address(this)).balance
                }();
            } else {
                ICurveStableSwapSteth(CURVE_STETH_LIQUIDITY_POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    CURVE_STETH_POOL_INDEX_STETH,
                    _minIncomingStethAmount
                );
            }
        } else {
            ICurveStableSwapSteth(CURVE_STETH_LIQUIDITY_POOL).remove_liquidity(
                _outgoingLPTokenAmount,
                [_minIncomingWethAmount, _minIncomingStethAmount]
            );

            IWETH(payable(CURVE_STETH_LIQUIDITY_WETH_TOKEN)).deposit{
                value: payable(address(this)).balance
            }();
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_STETH_LIQUIDITY_POOL` variable
    /// @return pool_ The `CURVE_STETH_LIQUIDITY_POOL` variable value
    function getCurveStethLiquidityPool() public view returns (address pool_) {
        return CURVE_STETH_LIQUIDITY_POOL;
    }

    /// @notice Gets the `CURVE_STETH_LIQUIDITY_WETH_TOKEN` variable
    /// @return wethToken_ The `CURVE_STETH_LIQUIDITY_WETH_TOKEN` variable value
    function getCurveStethLiquidityWethToken() public view returns (address wethToken_) {
        return CURVE_STETH_LIQUIDITY_WETH_TOKEN;
    }
}

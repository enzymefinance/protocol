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
import "../../../../../interfaces/ICurveStableSwapSeth.sol";
import "../../../../../interfaces/IWETH.sol";

/// @title CurveSethLiquidityActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Curve seth pool's liquidity functions
/// @dev Inheriting contract must have a receive() function
abstract contract CurveSethLiquidityActionsMixin {
    using SafeERC20 for ERC20;

    int128 private constant CURVE_SETH_POOL_INDEX_ETH = 0;
    int128 private constant CURVE_SETH_POOL_INDEX_SETH = 1;

    address private immutable CURVE_SETH_LIQUIDITY_POOL;
    address private immutable CURVE_SETH_LIQUIDITY_WETH_TOKEN;

    constructor(
        address _pool,
        address _sethToken,
        address _wethToken
    ) public {
        CURVE_SETH_LIQUIDITY_POOL = _pool;
        CURVE_SETH_LIQUIDITY_WETH_TOKEN = _wethToken;

        // Pre-approve pool to use max of seth token
        ERC20(_sethToken).safeApprove(_pool, type(uint256).max);
    }

    /// @dev Helper to add liquidity to the pool
    function __curveSethLend(
        uint256 _outgoingWethAmount,
        uint256 _outgoingSethAmount,
        uint256 _minIncomingLPTokenAmount
    ) internal {
        if (_outgoingWethAmount > 0) {
            IWETH((CURVE_SETH_LIQUIDITY_WETH_TOKEN)).withdraw(_outgoingWethAmount);
        }

        ICurveStableSwapSeth(CURVE_SETH_LIQUIDITY_POOL).add_liquidity{value: _outgoingWethAmount}(
            [_outgoingWethAmount, _outgoingSethAmount],
            _minIncomingLPTokenAmount
        );
    }

    /// @dev Helper to remove liquidity from the pool.
    // Assumes that if _redeemSingleAsset is true, then
    // "_minIncomingWethAmount > 0 XOR _minIncomingSethAmount > 0" has already been validated.
    function __curveSethRedeem(
        uint256 _outgoingLPTokenAmount,
        uint256 _minIncomingWethAmount,
        uint256 _minIncomingSethAmount,
        bool _redeemSingleAsset
    ) internal {
        if (_redeemSingleAsset) {
            if (_minIncomingWethAmount > 0) {
                ICurveStableSwapSeth(CURVE_SETH_LIQUIDITY_POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    CURVE_SETH_POOL_INDEX_ETH,
                    _minIncomingWethAmount
                );

                IWETH(payable(CURVE_SETH_LIQUIDITY_WETH_TOKEN)).deposit{
                    value: payable(address(this)).balance
                }();
            } else {
                ICurveStableSwapSeth(CURVE_SETH_LIQUIDITY_POOL).remove_liquidity_one_coin(
                    _outgoingLPTokenAmount,
                    CURVE_SETH_POOL_INDEX_SETH,
                    _minIncomingSethAmount
                );
            }
        } else {
            ICurveStableSwapSeth(CURVE_SETH_LIQUIDITY_POOL).remove_liquidity(
                _outgoingLPTokenAmount,
                [_minIncomingWethAmount, _minIncomingSethAmount]
            );

            IWETH(payable(CURVE_SETH_LIQUIDITY_WETH_TOKEN)).deposit{
                value: payable(address(this)).balance
            }();
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_SETH_LIQUIDITY_POOL` variable
    /// @return pool_ The `CURVE_SETH_LIQUIDITY_POOL` variable value
    function getCurveSethLiquidityPool() public view returns (address pool_) {
        return CURVE_SETH_LIQUIDITY_POOL;
    }

    /// @notice Gets the `CURVE_SETH_LIQUIDITY_WETH_TOKEN` variable
    /// @return wethToken_ The `CURVE_SETH_LIQUIDITY_WETH_TOKEN` variable value
    function getCurveSethLiquidityWethToken() public view returns (address wethToken_) {
        return CURVE_SETH_LIQUIDITY_WETH_TOKEN;
    }
}

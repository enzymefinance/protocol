// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/IUniswapV2Router2.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title UniswapV2ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with Uniswap v2
abstract contract UniswapV2ActionsMixin is AssetHelpers {
    address private immutable UNISWAP_V2_ROUTER2;

    constructor(address _router) public {
        UNISWAP_V2_ROUTER2 = _router;
    }

    // EXTERNAL FUNCTIONS

    /// @dev Helper to add liquidity
    function __uniswapV2Lend(
        address _recipient,
        address _tokenA,
        address _tokenB,
        uint256 _amountADesired,
        uint256 _amountBDesired,
        uint256 _amountAMin,
        uint256 _amountBMin
    ) internal {
        __approveAssetMaxAsNeeded(_tokenA, UNISWAP_V2_ROUTER2, _amountADesired);
        __approveAssetMaxAsNeeded(_tokenB, UNISWAP_V2_ROUTER2, _amountBDesired);

        // Execute lend on Uniswap
        IUniswapV2Router2(UNISWAP_V2_ROUTER2).addLiquidity(
            _tokenA,
            _tokenB,
            _amountADesired,
            _amountBDesired,
            _amountAMin,
            _amountBMin,
            _recipient,
            __uniswapV2GetActionDeadline()
        );
    }

    /// @dev Helper to remove liquidity
    function __uniswapV2Redeem(
        address _recipient,
        address _poolToken,
        uint256 _poolTokenAmount,
        address _tokenA,
        address _tokenB,
        uint256 _amountAMin,
        uint256 _amountBMin
    ) internal {
        __approveAssetMaxAsNeeded(_poolToken, UNISWAP_V2_ROUTER2, _poolTokenAmount);

        // Execute redeem on Uniswap
        IUniswapV2Router2(UNISWAP_V2_ROUTER2).removeLiquidity(
            _tokenA,
            _tokenB,
            _poolTokenAmount,
            _amountAMin,
            _amountBMin,
            _recipient,
            __uniswapV2GetActionDeadline()
        );
    }

    /// @dev Helper to execute a swap
    function __uniswapV2Swap(
        address _recipient,
        uint256 _outgoingAssetAmount,
        uint256 _minIncomingAssetAmount,
        address[] memory _path
    ) internal {
        __approveAssetMaxAsNeeded(_path[0], UNISWAP_V2_ROUTER2, _outgoingAssetAmount);

        // Execute fill
        IUniswapV2Router2(UNISWAP_V2_ROUTER2).swapExactTokensForTokens(
            _outgoingAssetAmount,
            _minIncomingAssetAmount,
            _path,
            _recipient,
            __uniswapV2GetActionDeadline()
        );
    }

    /// @dev Helper to swap many assets to a single target asset.
    /// The intermediary asset will generally be WETH, and though we could make it
    // per-outgoing asset, seems like overkill until there is a need.
    function __uniswapV2SwapManyToOne(
        address _recipient,
        address[] memory _outgoingAssets,
        uint256[] memory _outgoingAssetAmounts,
        address _incomingAsset,
        address _intermediaryAsset
    ) internal {
        bool noIntermediary = _intermediaryAsset == address(0) ||
            _intermediaryAsset == _incomingAsset;
        for (uint256 i; i < _outgoingAssets.length; i++) {
            // Skip cases where outgoing and incoming assets are the same, or
            // there is no specified outgoing asset or amount
            if (
                _outgoingAssetAmounts[i] == 0 ||
                _outgoingAssets[i] == address(0) ||
                _outgoingAssets[i] == _incomingAsset
            ) {
                continue;
            }

            address[] memory uniswapPath;
            if (noIntermediary || _outgoingAssets[i] == _intermediaryAsset) {
                uniswapPath = new address[](2);
                uniswapPath[0] = _outgoingAssets[i];
                uniswapPath[1] = _incomingAsset;
            } else {
                uniswapPath = new address[](3);
                uniswapPath[0] = _outgoingAssets[i];
                uniswapPath[1] = _intermediaryAsset;
                uniswapPath[2] = _incomingAsset;
            }

            __uniswapV2Swap(_recipient, _outgoingAssetAmounts[i], 1, uniswapPath);
        }
    }

    /// @dev Helper to get the deadline for a Uniswap V2 action in a standardized way
    function __uniswapV2GetActionDeadline() private view returns (uint256 deadline_) {
        return block.timestamp + 1;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `UNISWAP_V2_ROUTER2` variable
    /// @return router_ The `UNISWAP_V2_ROUTER2` variable value
    function getUniswapV2Router2() public view returns (address router_) {
        return UNISWAP_V2_ROUTER2;
    }
}

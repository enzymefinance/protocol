// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {SafeMath} from "openzeppelin-solc-0.7/math/SafeMath.sol";

import {INonfungiblePositionManager} from "uniswap-v3-periphery/interfaces/INonfungiblePositionManager.sol";
import {PositionValue} from "uniswap-v3-periphery/libraries/PositionValue.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
// WrappedSafeERC20 is compatible with solc 7
import {WrappedSafeERC20 as SafeERC20} from "../../../../../utils/0.6.12/open-zeppelin/WrappedSafeERC20.sol";
import {IValueInterpreter} from "../../../../infrastructure/value-interpreter/IValueInterpreter.sol";
import {UniswapV3LiquidityPositionLibBase1} from "./bases/UniswapV3LiquidityPositionLibBase1.sol";
import {IUniswapV3LiquidityPosition} from "./IUniswapV3LiquidityPosition.sol";
import {UniswapV3LiquidityPositionDataDecoder} from "./UniswapV3LiquidityPositionDataDecoder.sol";

/// @title UniswapV3LiquidityPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for uniswap liquidity positions
contract UniswapV3LiquidityPositionLib is
    IUniswapV3LiquidityPosition,
    UniswapV3LiquidityPositionLibBase1,
    UniswapV3LiquidityPositionDataDecoder
{
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address private immutable NON_FUNGIBLE_TOKEN_MANAGER;
    address private immutable VALUE_INTERPRETER;

    uint256 private constant TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE = 10 ** 18;
    uint256 private constant UNISWAP_SQRT_INFLATE_FACTOR = 2 ** 192;

    constructor(address _nonFungibleTokenManager, address _valueInterpreter) {
        NON_FUNGIBLE_TOKEN_MANAGER = _nonFungibleTokenManager;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Mint)) {
            (
                address token0,
                address token1,
                uint24 fee,
                int24 tickLower,
                int24 tickUpper,
                uint256 amount0Desired,
                uint256 amount1Desired,
                uint256 amount0Min,
                uint256 amount1Min
            ) = __decodeMintActionArgs(actionArgs);

            __mint(
                INonfungiblePositionManager.MintParams({
                    token0: token0,
                    token1: token1,
                    fee: fee,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired: amount0Desired,
                    amount1Desired: amount1Desired,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );
        } else if (actionId == uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.AddLiquidity)) {
            (uint256 nftId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
                __decodeAddLiquidityActionArgs(actionArgs);

            __addLiquidity(
                INonfungiblePositionManager.IncreaseLiquidityParams({
                    tokenId: nftId,
                    amount0Desired: amount0Desired,
                    amount1Desired: amount1Desired,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                })
            );
        } else if (actionId == uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.RemoveLiquidity)) {
            (uint256 nftId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min) =
                __decodeRemoveLiquidityActionArgs(actionArgs);

            __removeLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: nftId,
                    liquidity: liquidity,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                })
            );
        } else if (actionId == uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Purge)) {
            (uint256 nftId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min) =
                __decodePurgeActionArgs(actionArgs);

            __purge(nftId, liquidity, amount0Min, amount1Min);
        } else if (actionId == uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Collect)) {
            __collect(__decodeCollectActionArgs(actionArgs));
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Adds liquidity to the uniswap position
    function __addLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams memory _params) private {
        // No need to approve assets since pre-approved during minting

        (, uint256 amount0, uint256 amount1) =
            INonfungiblePositionManager(getNonFungibleTokenManager()).increaseLiquidity(_params);

        if (amount0 < _params.amount0Desired) {
            address token0 = getToken0ForNft(_params.tokenId);
            IERC20(token0).safeTransfer(msg.sender, IERC20(token0).balanceOf(address(this)));
        }

        if (amount1 < _params.amount1Desired) {
            address token1 = getToken1ForNft(_params.tokenId);
            IERC20(token1).safeTransfer(msg.sender, IERC20(token1).balanceOf(address(this)));
        }
    }

    /// @dev Helper to approve a target account with the max amount of an asset
    function __approveAssetMaxAsNeeded(address _asset, address _target, uint256 _neededAmount) internal {
        uint256 allowance = IERC20(_asset).allowance(address(this), _target);
        if (allowance < _neededAmount) {
            if (allowance > 0) {
                IERC20(_asset).safeApprove(_target, 0);
            }
            IERC20(_asset).safeApprove(_target, type(uint256).max);
        }
    }

    /// @dev Collects all uncollected amounts from the nft position and sends it to the vaultProxy
    function __collect(uint256 _nftId) private {
        INonfungiblePositionManager(getNonFungibleTokenManager()).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: _nftId,
                recipient: address(msg.sender),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
    }

    /// @dev Helper to get the total liquidity of an nft position.
    /// Uses a low-level staticcall() and truncated decoding of `.positions()`
    /// in order to avoid compilation error.
    function __getLiquidityForNFT(uint256 _nftId) private view returns (uint128 liquidity_) {
        (bool success, bytes memory returnData) = getNonFungibleTokenManager().staticcall(
            abi.encodeWithSelector(INonfungiblePositionManager.positions.selector, _nftId)
        );
        require(success, string(returnData));

        (,,,,,,, liquidity_) =
            abi.decode(returnData, (uint96, address, address, address, uint24, int24, int24, uint128));

        return liquidity_;
    }

    /// @dev Mints a new uniswap position, receiving an nft as a receipt
    function __mint(INonfungiblePositionManager.MintParams memory _params) private {
        // Grant max token approval to the nft manager as necessary
        __approveAssetMaxAsNeeded(_params.token0, getNonFungibleTokenManager(), _params.amount0Desired);
        __approveAssetMaxAsNeeded(_params.token1, getNonFungibleTokenManager(), _params.amount1Desired);

        // Mint the nft
        (uint256 tokenId,, uint256 amount0, uint256 amount1) =
            INonfungiblePositionManager(getNonFungibleTokenManager()).mint(_params);

        // Update local storage
        nftIds.push(tokenId);
        nftIdToToken0[tokenId] = _params.token0;
        nftIdToToken1[tokenId] = _params.token1;

        // Transfer back to the vaultProxy tokens not added as liquidity
        if (amount0 < _params.amount0Desired) {
            IERC20(_params.token0).safeTransfer(msg.sender, IERC20(_params.token0).balanceOf(address(this)));
        }

        if (amount1 < _params.amount1Desired) {
            IERC20(_params.token1).safeTransfer(msg.sender, IERC20(_params.token1).balanceOf(address(this)));
        }

        emit NFTPositionAdded(tokenId);
    }

    /// @dev Purges a position by removing all liquidity,
    /// collecting and transferring all tokens owed to the vault,
    /// and burning the nft.
    /// _liquidity == 0 signifies no liquidity to be removed (i.e., only collect and burn).
    /// 0 < _liquidity 0 < max uint128 signifies the full amount of liquidity is known (more gas-efficient).
    /// _liquidity == max uint128 signifies the full amount of liquidity is unknown.
    function __purge(uint256 _nftId, uint128 _liquidity, uint256 _amount0Min, uint256 _amount1Min) private {
        if (_liquidity == type(uint128).max) {
            // This consumes a lot of unnecessary gas because of all the SLOAD operations,
            // when we only care about `liquidity`.
            // Should ideally only be used in the rare case where a griefing attack
            // (i.e., frontrunning the tx and adding extra liquidity dust) is a concern.
            _liquidity = __getLiquidityForNFT(_nftId);
        }

        if (_liquidity > 0) {
            INonfungiblePositionManager(getNonFungibleTokenManager()).decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: _nftId,
                    liquidity: _liquidity,
                    amount0Min: _amount0Min,
                    amount1Min: _amount1Min,
                    deadline: block.timestamp
                })
            );
        }

        __collect(_nftId);

        // Reverts if liquidity or uncollected tokens are remaining
        INonfungiblePositionManager(getNonFungibleTokenManager()).burn(_nftId);

        // Can later replace with the helper from AddressArrayLib.sol, updated for solc 7
        uint256 nftCount = nftIds.length;
        for (uint256 i; i < nftCount; i++) {
            if (nftIds[i] == _nftId) {
                if (i < nftCount - 1) {
                    nftIds[i] = nftIds[nftCount - 1];
                }
                nftIds.pop();
                break;
            }
        }
        delete nftIdToToken0[_nftId];
        delete nftIdToToken1[_nftId];

        emit NFTPositionRemoved(_nftId);
    }

    /// @dev Removes liquidity from the uniswap position and transfers the tokens back to the vault
    function __removeLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams memory _params) private {
        INonfungiblePositionManager(getNonFungibleTokenManager()).decreaseLiquidity(_params);

        __collect(_params.tokenId);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        uint256[] memory nftIdsCopy = getNftIds();
        if (nftIdsCopy.length == 0) {
            return (assets_, amounts_);
        }

        assets_ = new address[](nftIdsCopy.length * 2);
        amounts_ = new uint256[](assets_.length);
        // Used as a cache to refer to previous lookups for the same asset pair
        uint160[] memory sqrtPricesX96 = new uint160[](nftIdsCopy.length);
        for (uint256 i; i < nftIdsCopy.length; i++) {
            (address token0, address token1) = getPairForNft(nftIdsCopy[i]);
            uint256 token0Index = i * 2;
            uint256 token1Index = token0Index + 1;

            assets_[token0Index] = token0;
            assets_[token1Index] = token1;

            // Recycle the trusted rate for nfts of the same asset pair
            uint160 sqrtPriceX96;
            for (uint256 j; j < i; j++) {
                if (token0 == assets_[j * 2] && token1 == assets_[j * 2 + 1]) {
                    sqrtPriceX96 = sqrtPricesX96[j];
                    break;
                }
            }

            if (sqrtPriceX96 == 0) {
                uint256 token0VirtualReserves = IValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetValue(
                    token1, TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE, token0
                );

                // Adapted from UniswapV3 white paper formula 6.4 <https://uniswap.org/whitepaper-v3.pdf>
                sqrtPriceX96 = uint160(
                    __uniswapSqrt(
                        (UNISWAP_SQRT_INFLATE_FACTOR.mul(TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE)).div(
                            token0VirtualReserves
                        )
                    )
                );
                sqrtPricesX96[i] = sqrtPriceX96;
            }

            (amounts_[token0Index], amounts_[token1Index]) = PositionValue.total(
                INonfungiblePositionManager(getNonFungibleTokenManager()), nftIdsCopy[i], sqrtPriceX96
            );
        }

        // If more than 1 position, combine amounts of the same asset.
        // We can remove this if/when we aggregate asset amounts at the ComptrollerLib level.
        if (nftIdsCopy.length > 1) {
            (assets_, amounts_) = __aggregateAssetAmounts(assets_, amounts_);
        }

        return (assets_, amounts_);
    }

    /// @dev Helper to aggregate amounts of the same assets
    function __aggregateAssetAmounts(address[] memory _rawAssets, uint256[] memory _rawAmounts)
        private
        pure
        returns (address[] memory aggregatedAssets_, uint256[] memory aggregatedAmounts_)
    {
        if (_rawAssets.length == 0) {
            return (aggregatedAssets_, aggregatedAmounts_);
        }

        uint256 aggregatedAssetCount = 1;
        for (uint256 i = 1; i < _rawAssets.length; i++) {
            bool contains;
            for (uint256 j; j < i; j++) {
                if (_rawAssets[i] == _rawAssets[j]) {
                    contains = true;
                    break;
                }
            }
            if (!contains) {
                aggregatedAssetCount++;
            }
        }

        aggregatedAssets_ = new address[](aggregatedAssetCount);
        aggregatedAmounts_ = new uint256[](aggregatedAssetCount);
        uint256 aggregatedAssetIndex;
        for (uint256 i; i < _rawAssets.length; i++) {
            bool contains;
            for (uint256 j; j < aggregatedAssetIndex; j++) {
                if (_rawAssets[i] == aggregatedAssets_[j]) {
                    contains = true;

                    aggregatedAmounts_[j] += _rawAmounts[i];

                    break;
                }
            }
            if (!contains) {
                aggregatedAssets_[aggregatedAssetIndex] = _rawAssets[i];
                aggregatedAmounts_[aggregatedAssetIndex] = _rawAmounts[i];
                aggregatedAssetIndex++;
            }
        }

        return (aggregatedAssets_, aggregatedAmounts_);
    }

    /// @dev Uniswap square root function. See:
    /// https://github.com/Uniswap/uniswap-lib/blob/6ddfedd5716ba85b905bf34d7f1f3c659101a1bc/contracts/libraries/Babylonian.sol
    function __uniswapSqrt(uint256 _y) private pure returns (uint256 z_) {
        if (_y > 3) {
            z_ = _y;
            uint256 x = _y / 2 + 1;
            while (x < z_) {
                z_ = x;
                x = (_y / x + x) / 2;
            }
        } else if (_y != 0) {
            z_ = 1;
        }
        // else z_ = 0

        return z_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `nftIds` variable
    /// @return nftIds_ The `nftIds` variable value
    function getNftIds() public view returns (uint256[] memory nftIds_) {
        return nftIds;
    }

    /// @notice Gets the `NON_FUNGIBLE_TOKEN_MANAGER` variable
    /// @return nonFungibleTokenManager_ The `NON_FUNGIBLE_TOKEN_MANAGER` variable value
    function getNonFungibleTokenManager() public view returns (address nonFungibleTokenManager_) {
        return NON_FUNGIBLE_TOKEN_MANAGER;
    }

    /// @notice Gets the cached ordered asset pair of the Uniswap pool for a given nft
    /// @param _nftId The id of the nft
    /// @return token0_ The `token0` value
    /// @return token1_ The `token1` value
    function getPairForNft(uint256 _nftId) public view override returns (address token0_, address token1_) {
        return (getToken0ForNft(_nftId), getToken1ForNft(_nftId));
    }

    /// @notice Gets the cached `token0` value for the Uniswap pool for a given nft
    /// @param _nftId The id of the nft
    /// @return token0_ The `token0` value
    function getToken0ForNft(uint256 _nftId) public view returns (address token0_) {
        return nftIdToToken0[_nftId];
    }

    /// @notice Gets the cached `token1` value for the Uniswap pool for a given nft
    /// @param _nftId The id of the nft
    /// @return token1_ The `token1` value
    function getToken1ForNft(uint256 _nftId) public view returns (address token1_) {
        return nftIdToToken1[_nftId];
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `NON_FUNGIBLE_TOKEN_MANAGER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}

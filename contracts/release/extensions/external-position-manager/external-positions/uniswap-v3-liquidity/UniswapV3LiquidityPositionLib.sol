// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin-solc-0.7/contracts/math/SafeMath.sol";
import "@openzeppelin-solc-0.7/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin-solc-0.7/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-periphery/contracts/libraries/PositionValue.sol";
import "../../../../../persistent/external-positions/uniswap-v3-liquidity/UniswapV3LiquidityPositionLibBase1.sol";
import "./interfaces/IUniswapV3LiquidityPosition.sol";
import "./interfaces/IValueInterpreterUniswapV3LiquidityPosition.sol";
import "./UniswapV3LiquidityPositionDataDecoder.sol";

/// @title UniswapV3LiquidityPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for uniswap liquidity positions
contract UniswapV3LiquidityPositionLib is
    IUniswapV3LiquidityPosition,
    UniswapV3LiquidityPositionLibBase1,
    UniswapV3LiquidityPositionDataDecoder
{
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    address private immutable NON_FUNGIBLE_TOKEN_MANAGER;
    address private immutable VALUE_INTERPRETER;

    uint256 private constant TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE = 10**18;
    uint256 private constant UNISWAP_SQRT_INFLATE_FACTOR = 2**192;

    constructor(address _nonFungibleTokenManager, address _valueInterpreter) {
        NON_FUNGIBLE_TOKEN_MANAGER = _nonFungibleTokenManager;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Initializes the external position
    /// @param _initArgs The encoded data to use during initialization
    function init(bytes memory _initArgs) external override {
        require(token0 == address(0), "init: Already initialized");

        (address token0Val, address token1Val) = __decodeInitArgs(_initArgs);

        token0 = token0Val;
        token1 = token1Val;

        // Approve the NFT manager once for the max of each token
        ERC20(token0Val).safeApprove(getNonFungibleTokenManager(), type(uint256).max);
        ERC20(token1Val).safeApprove(getNonFungibleTokenManager(), type(uint256).max);

        emit Initialized(token0Val, token1Val);
    }

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (
            actionId == uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Mint)
        ) {
            (
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
        } else if (
            actionId ==
            uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.AddLiquidity)
        ) {
            (
                uint256 nftId,
                uint256 amount0Desired,
                uint256 amount1Desired,
                uint256 amount0Min,
                uint256 amount1Min
            ) = __decodeAddLiquidityActionArgs(actionArgs);

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
        } else if (
            actionId ==
            uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.RemoveLiquidity)
        ) {
            (
                uint256 nftId,
                uint128 liquidity,
                uint256 amount0Min,
                uint256 amount1Min
            ) = __decodeRemoveLiquidityActionArgs(actionArgs);

            __removeLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: nftId,
                    liquidity: liquidity,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                })
            );
        } else if (
            actionId ==
            uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Purge)
        ) {
            (
                uint256 nftId,
                uint128 liquidity,
                uint256 amount0Min,
                uint256 amount1Min
            ) = __decodePurgeActionArgs(actionArgs);

            __purge(nftId, liquidity, amount0Min, amount1Min);
        } else if (
            actionId ==
            uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Collect)
        ) {
            __collect(__decodeCollectActionArgs(actionArgs));
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Adds liquidity to the uniswap position
    function __addLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams memory _params)
        private
    {
        (, uint256 amount0, uint256 amount1) = INonfungiblePositionManager(
            getNonFungibleTokenManager()
        )
            .increaseLiquidity(_params);

        if (amount0 < _params.amount0Desired) {
            ERC20(token0).safeTransfer(msg.sender, ERC20(token0).balanceOf(address(this)));
        }

        if (amount1 < _params.amount1Desired) {
            ERC20(token1).safeTransfer(msg.sender, ERC20(token1).balanceOf(address(this)));
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

        (, , , , , , , liquidity_) = abi.decode(
            returnData,
            (uint96, address, address, address, uint24, int24, int24, uint128)
        );

        return liquidity_;
    }

    /// @dev Mints a new uniswap position, receiving an nft as a receipt
    function __mint(INonfungiblePositionManager.MintParams memory _params) private {
        (uint256 tokenId, , uint256 amount0, uint256 amount1) = INonfungiblePositionManager(
            getNonFungibleTokenManager()
        )
            .mint(_params);

        nftIds.push(tokenId);

        // Transfer back to the vaultProxy tokens not added as liquidity
        if (amount0 < _params.amount0Desired) {
            ERC20(_params.token0).safeTransfer(
                msg.sender,
                ERC20(_params.token0).balanceOf(address(this))
            );
        }

        if (amount1 < _params.amount1Desired) {
            ERC20(_params.token1).safeTransfer(
                msg.sender,
                ERC20(_params.token1).balanceOf(address(this))
            );
        }

        emit NFTPositionAdded(tokenId);
    }

    /// @dev Purges a position by removing all liquidity,
    /// collecting and transferring all tokens owed to the vault,
    /// and burning the nft.
    /// _liquidity == 0 signifies no liquidity to be removed (i.e., only collect and burn).
    /// 0 < _liquidity 0 < max uint128 signifies the full amount of liquidity is known (more gas-efficient).
    /// _liquidity == max uint128 signifies the full amount of liquidity is unknown.
    function __purge(
        uint256 _nftId,
        uint128 _liquidity,
        uint256 _amount0Min,
        uint256 _amount1Min
    ) private {
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

        emit NFTPositionRemoved(_nftId);
    }

    /// @dev Removes liquidity from the uniswap position and transfers the tokens back to the vault
    function __removeLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams memory _params)
        private
    {
        INonfungiblePositionManager(getNonFungibleTokenManager()).decreaseLiquidity(_params);

        __collect(_params.tokenId);
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

    // EXTERNAL FUNCTIONS

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets()
        external
        pure
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        uint256[] memory nftIdsCopy = getNftIds();
        if (nftIdsCopy.length == 0) {
            return (assets_, amounts_);
        }

        assets_ = new address[](2);
        amounts_ = new uint256[](2);

        address token0Copy = getToken0();
        address token1Copy = getToken1();
        assets_[0] = token0Copy;
        assets_[1] = token1Copy;

        uint256 token0VirtualReserves = IValueInterpreterUniswapV3LiquidityPosition(
            VALUE_INTERPRETER
        )
            .calcCanonicalAssetValue(token1Copy, TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE, token0Copy);
        // Adapted from UniswapV3 white paper formula 6.4 <https://uniswap.org/whitepaper-v3.pdf>
        uint160 sqrtPriceX96 = uint160(
            __uniswapSqrt(
                (UNISWAP_SQRT_INFLATE_FACTOR.mul(TRUSTED_RATE_INITIAL_VIRTUAL_BALANCE)).div(
                    token0VirtualReserves
                )
            )
        );

        for (uint256 i; i < nftIdsCopy.length; i++) {
            (uint256 amount0, uint256 amount1) = PositionValue.total(
                INonfungiblePositionManager(getNonFungibleTokenManager()),
                nftIdsCopy[i],
                sqrtPriceX96
            );

            amounts_[0] = amounts_[0].add(amount0);
            amounts_[1] = amounts_[1].add(amount1);
        }

        return (assets_, amounts_);
    }

    // PUBLIC FUNCTIONS

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

    /// @notice Gets the pair of tokens of the pool
    /// @return token0_ The `token0` variable value
    /// @return token1_ The `token1` variable value
    function getPair() public view override returns (address token0_, address token1_) {
        return (getToken0(), getToken1());
    }

    /// @notice Gets the `token0` variable
    /// @return token0_ The `token0` variable value
    function getToken0() public view returns (address token0_) {
        return token0;
    }

    /// @notice Gets the `token1` variable
    /// @return token1_ The `token1` variable value
    function getToken1() public view returns (address token1_) {
        return token1;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable
    /// @return valueInterpreter_ The `NON_FUNGIBLE_TOKEN_MANAGER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}

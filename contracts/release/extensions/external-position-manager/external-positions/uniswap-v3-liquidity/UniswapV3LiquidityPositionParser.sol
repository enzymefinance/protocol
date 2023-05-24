// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "openzeppelin-solc-0.7/token/ERC721/ERC721.sol";
import "./interfaces/IExternalPositionParserUniswapV3LiquidityPosition.sol";
import "./interfaces/IUniswapV3LiquidityPosition.sol";
import "./interfaces/IValueInterpreterUniswapV3LiquidityPosition.sol";
import "./UniswapV3LiquidityPositionDataDecoder.sol";

pragma solidity 0.7.6;

/// @title UniswapV3LiquidityPositionParser
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Parser for UniswapV3 Liquidity Positions
contract UniswapV3LiquidityPositionParser is
    IExternalPositionParserUniswapV3LiquidityPosition,
    UniswapV3LiquidityPositionDataDecoder
{
    address private immutable UNISWAP_V3_NON_FUNGIBLE_POSITION_MANAGER;
    address private immutable VALUE_INTERPRETER;

    constructor(address _valueInterpreter, address _nonfungiblePositionManager) {
        UNISWAP_V3_NON_FUNGIBLE_POSITION_MANAGER = _nonfungiblePositionManager;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Parses the assets to send and receive for the callOnExternalPosition
    /// @param _externalPosition The _externalPosition to be called
    /// @param _actionId The _actionId for the callOnExternalPosition
    /// @param _encodedActionArgs The encoded parameters for the callOnExternalPosition
    /// @return assetsToTransfer_ The assets to be transferred from the Vault
    /// @return amountsToTransfer_ The amounts to be transferred from the Vault
    /// @return assetsToReceive_ The assets to be received at the Vault
    function parseAssetsForAction(
        address _externalPosition,
        uint256 _actionId,
        bytes memory _encodedActionArgs
    )
        external
        view
        override
        returns (
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_
        )
    {
        if (
            _actionId ==
            uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.Mint)
        ) {
            (
                address token0,
                address token1,
                ,
                ,
                ,
                uint256 amount0Desired,
                uint256 amount1Desired,
                ,

            ) = __decodeMintActionArgs(_encodedActionArgs);

            require(__poolIsSupportable(token0, token1), "parseAssetsForAction: Unsupported pair");
            // We do not validate whether an external position for the fund already exists,
            // but callers should be aware that one instance can be used for multiple nft positions

            assetsToTransfer_ = new address[](2);
            assetsToTransfer_[0] = token0;
            assetsToTransfer_[1] = token1;

            amountsToTransfer_ = new uint256[](2);
            amountsToTransfer_[0] = amount0Desired;
            amountsToTransfer_[1] = amount1Desired;
        } else if (
            _actionId ==
            uint256(IUniswapV3LiquidityPosition.UniswapV3LiquidityPositionActions.AddLiquidity)
        ) {
            (
                uint256 nftId,
                uint256 amount0Desired,
                uint256 amount1Desired,
                ,

            ) = __decodeAddLiquidityActionArgs(_encodedActionArgs);

            // Cheaper than storing an additional mapping of nfts or looping through the nftIds array
            require(
                _externalPosition ==
                    ERC721(getUniswapV3NonfungiblePositionManager()).ownerOf(nftId),
                "__decodeEncodedActionArgs: Invalid nftId"
            );

            assetsToTransfer_ = new address[](2);
            amountsToTransfer_ = new uint256[](2);

            (assetsToTransfer_[0], assetsToTransfer_[1]) = IUniswapV3LiquidityPosition(
                _externalPosition
            ).getPairForNft(nftId);

            amountsToTransfer_[0] = amount0Desired;
            amountsToTransfer_[1] = amount1Desired;
        } else {
            // RemoveLiquidity, Purge, or Collect

            // First arg of each is nftId
            uint256 nftId = abi.decode(_encodedActionArgs, (uint256));

            assetsToReceive_ = new address[](2);
            (assetsToReceive_[0], assetsToReceive_[1]) = IUniswapV3LiquidityPosition(
                _externalPosition
            ).getPairForNft(nftId);
        }

        return (assetsToTransfer_, amountsToTransfer_, assetsToReceive_);
    }

    /// @notice Parse and validate input arguments to be used when initializing a newly-deployed ExternalPositionProxy
    /// @dev Empty for this external position type
    function parseInitArgs(address, bytes memory) external view override returns (bytes memory) {}

    // PRIVATE FUNCTIONS

    /// @dev Helper to determine if a pool is supportable, based on whether a trusted rate
    /// is available for its underlying token pair. Both of the underlying tokens must be supported,
    /// and at least one must be a supported primitive asset.
    function __poolIsSupportable(address _tokenA, address _tokenB)
        private
        view
        returns (bool isSupportable_)
    {
        IValueInterpreterUniswapV3LiquidityPosition valueInterpreterContract = IValueInterpreterUniswapV3LiquidityPosition(
                getValueInterpreter()
            );

        if (valueInterpreterContract.isSupportedPrimitiveAsset(_tokenA)) {
            if (valueInterpreterContract.isSupportedAsset(_tokenB)) {
                return true;
            }
        } else if (
            valueInterpreterContract.isSupportedDerivativeAsset(_tokenA) &&
            valueInterpreterContract.isSupportedPrimitiveAsset(_tokenB)
        ) {
            return true;
        }

        return false;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `UNISWAP_V3_NON_FUNGIBLE_POSITION_MANAGER` variable value
    /// @return nonfungiblePositionManager_ The `UNISWAP_V3_NON_FUNGIBLE_POSITION_MANAGER` variable value
    function getUniswapV3NonfungiblePositionManager()
        public
        view
        returns (address nonfungiblePositionManager_)
    {
        return UNISWAP_V3_NON_FUNGIBLE_POSITION_MANAGER;
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable value
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() public view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}

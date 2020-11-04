// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/IUniswapV2Pair.sol";
import "../../../../utils/MathHelpers.sol";
import "../IDerivativePriceFeed.sol";

/// @title UniswapV2PoolPriceFeed Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Price feed for Uniswap lending pool tokens
contract UniswapV2PoolPriceFeed is IDerivativePriceFeed, MathHelpers {
    // *** TODO: RATE CALCULATION MUST BE FIXED BEFORE USING IN PROD

    uint256 private constant POOL_TOKEN_DECIMALS = 18;

    /// @notice Gets the rates for 1 unit of the derivative to its underlying assets
    /// @param _derivative The derivative for which to get the rates
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return rates_ The rates for the _derivative to the underlyings_
    function getRatesToUnderlyings(address _derivative)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory rates_)
    {
        underlyings_ = new address[](2);
        IUniswapV2Pair uniswapV2Pair = IUniswapV2Pair(_derivative);
        underlyings_[0] = uniswapV2Pair.token0();
        underlyings_[1] = uniswapV2Pair.token1();

        uint256 totalSupply = uniswapV2Pair.totalSupply();
        ERC20 token0 = ERC20(underlyings_[0]);
        ERC20 token1 = ERC20(underlyings_[1]);

        rates_ = new uint256[](2);
        rates_[0] = __calcNormalizedRate(
            POOL_TOKEN_DECIMALS,
            totalSupply,
            token0.decimals(),
            token0.balanceOf(_derivative)
        );
        rates_[1] = __calcNormalizedRate(
            POOL_TOKEN_DECIMALS,
            totalSupply,
            token1.decimals(),
            token1.balanceOf(_derivative)
        );

        return (underlyings_, rates_);
    }

    /// @notice Checks if an asset is supported by this price feed
    /// @return isSupported_ True if supported
    function isSupportedAsset(address) public view override returns (bool isSupported_) {
        return true;
    }
}

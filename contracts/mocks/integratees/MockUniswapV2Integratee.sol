// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../prices/MockUniswapV2PriceSource.sol";
import "./utils/SimpleMockIntegrateeBase.sol";

contract MockUniswapV2Integratee is SimpleMockIntegrateeBase {
    // TODO: NOT YET REVIEWED

    mapping(address => mapping(address => address)) public assetToAssetToPair;

    constructor(
        address[] memory _defaultRateAssets,
        address[] memory _listOfToken0,
        address[] memory _listOfToken1,
        address[] memory _listOfPair
    ) public SimpleMockIntegrateeBase(_defaultRateAssets, new address[](0), new uint8[](0), 18) {
        require(
            _listOfPair.length == _listOfToken0.length,
            "constructor: _listOfPair and _listOfToken0 have an unequal length"
        );
        require(
            _listOfPair.length == _listOfToken1.length,
            "constructor: _listOfPair and _listOfToken1 have an unequal length"
        );

        for (uint256 i; i < _listOfPair.length; i++) {
            address token0 = _listOfToken0[i];
            address token1 = _listOfToken1[i];
            address pair = _listOfPair[i];

            assetToAssetToPair[token0][token1] = pair;
            assetToAssetToPair[token1][token0] = pair;
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256,
        uint256,
        address,
        uint256
    )
        external
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        address pair = assetToAssetToPair[tokenA][tokenB];
        require(pair != address(0), "addLiquidity: this pair doesn't exist");
        ERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        ERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);
        // assign liquidity to amountADesired for testing more easily
        uint256 liquidity = amountADesired;
        ERC20(pair).transfer(msg.sender, liquidity);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256
    ) public returns (uint256, uint256) {
        address pair = assetToAssetToPair[tokenA][tokenB];
        require(pair != address(0), "removeLiquidity: this pair doesn't exist");
        ERC20(pair).transferFrom(msg.sender, address(this), liquidity);
        ERC20(tokenA).transfer(to, amountAMin);
        ERC20(tokenB).transfer(to, amountBMin);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address,
        uint256
    ) external returns (uint256[] memory) {
        __getRateAndSwapAssets(msg.sender, path[0], amountIn, path[path.length - 1]);
    }

    function getPair(address _token0, address _token1) external view returns (address) {
        return assetToAssetToPair[_token0][_token1];
    }
}

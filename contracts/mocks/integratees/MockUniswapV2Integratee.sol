// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../prices/CentralizedRateProvider.sol";
import "./utils/SimpleMockIntegrateeBase.sol";

/// @dev Mocks the integration with `UniswapV2Router02` <https://uniswap.org/docs/v2/smart-contracts/router02/>
/// Additionally mocks the integration with `UniswapV2Factory` <https://uniswap.org/docs/v2/smart-contracts/factory/>
contract MockUniswapV2Integratee is SwapperBase, Ownable {
    using SafeMath for uint256;
    mapping(address => mapping(address => address)) private assetToAssetToPair;

    address private immutable CENTRALIZED_RATE_PROVIDER;
    uint256 private constant PRECISION = 18;

    // Set in %, defines the MAX deviation per block from the mean rate
    uint256 private blockNumberDeviation;

    constructor(
        address[] memory _listOfToken0,
        address[] memory _listOfToken1,
        address[] memory _listOfPair,
        address _centralizedRateProvider,
        uint256 _blockNumberDeviation
    ) public {
        addPair(_listOfToken0, _listOfToken1, _listOfPair);
        CENTRALIZED_RATE_PROVIDER = _centralizedRateProvider;
        blockNumberDeviation = _blockNumberDeviation;
    }

    /// @dev Adds the maximum possible value from {_amountADesired _amountBDesired}
    /// Makes use of the value interpreter to perform those calculations
    function addLiquidity(
        address _tokenA,
        address _tokenB,
        uint256 _amountADesired,
        uint256 _amountBDesired,
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
        __addLiquidity(_tokenA, _tokenB, _amountADesired, _amountBDesired);
    }

    /// @dev Removes the specified amount of liquidity
    /// Returns 50% of the incoming liquidity value on each token.
    function removeLiquidity(
        address _tokenA,
        address _tokenB,
        uint256 _liquidity,
        uint256,
        uint256,
        address,
        uint256
    ) public returns (uint256, uint256) {
        __removeLiquidity(_tokenA, _tokenB, _liquidity);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address,
        uint256
    ) external returns (uint256[] memory) {
        uint256 amountOut = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(path[0], amountIn, path[1], blockNumberDeviation);

        __swapAssets(msg.sender, path[0], amountIn, path[path.length - 1], amountOut);
    }

    /// @dev We don't calculate any intermediate values here because they aren't actually used
    /// Returns the randomized by sender value of the edge path assets
    function getAmountsOut(uint256 _amountIn, address[] calldata _path)
        external
        returns (uint256[] memory amounts_)
    {
        require(_path.length >= 2, "getAmountsOut: path must be >= 2");

        address assetIn = _path[0];
        address assetOut = _path[_path.length - 1];

        uint256 amountOut = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomizedBySender(assetIn, _amountIn, assetOut);

        amounts_ = new uint256[](_path.length);
        amounts_[0] = _amountIn;
        amounts_[_path.length - 1] = amountOut;

        return amounts_;
    }

    function addPair(
        address[] memory _listOfToken0,
        address[] memory _listOfToken1,
        address[] memory _listOfPair
    ) public onlyOwner {
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

    function setBlockNumberDeviation(uint256 _deviationPct) external onlyOwner {
        blockNumberDeviation = _deviationPct;
    }

    // PRIVATE FUNCTIONS

    /// Avoids stack-too-deep error.
    function __addLiquidity(
        address _tokenA,
        address _tokenB,
        uint256 _amountADesired,
        uint256 _amountBDesired
    ) private {
        address pair = getPair(_tokenA, _tokenB);

        uint256 amountA;
        uint256 amountB;

        uint256 amountBFromA = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(_tokenA, _amountADesired, _tokenB);
        uint256 amountAFromB = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(_tokenB, _amountBDesired, _tokenA);

        if (amountBFromA >= _amountBDesired) {
            amountA = amountAFromB;
            amountB = _amountBDesired;
        } else {
            amountA = _amountADesired;
            amountB = amountBFromA;
        }

        uint256 tokenPerLPToken = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(pair, 10**uint256(PRECISION), _tokenA);

        // Calculate the inverse rate to know the amount of LPToken to return from a unit of token
        uint256 inverseRate = uint256(10**PRECISION).mul(10**PRECISION).div(tokenPerLPToken);

        // Total liquidity can be calculated as 2x liquidity from amount A
        uint256 totalLiquidity = uint256(2).mul(
            amountA.mul(inverseRate).div(uint256(10**PRECISION))
        );

        require(
            ERC20(pair).balanceOf(address(this)) >= totalLiquidity,
            "__addLiquidity: Integratee doesn't have enough pair balance to cover the expected amount"
        );

        address[] memory assetsToIntegratee = new address[](2);
        uint256[] memory assetsToIntegrateeAmounts = new uint256[](2);
        address[] memory assetsFromIntegratee = new address[](1);
        uint256[] memory assetsFromIntegrateeAmounts = new uint256[](1);

        assetsToIntegratee[0] = _tokenA;
        assetsToIntegrateeAmounts[0] = amountA;
        assetsToIntegratee[1] = _tokenB;
        assetsToIntegrateeAmounts[1] = amountB;
        assetsFromIntegratee[0] = pair;
        assetsFromIntegrateeAmounts[0] = totalLiquidity;

        __swap(
            msg.sender,
            assetsToIntegratee,
            assetsToIntegrateeAmounts,
            assetsFromIntegratee,
            assetsFromIntegrateeAmounts
        );
    }

    /// Avoids stack-too-deep error.
    function __removeLiquidity(
        address _tokenA,
        address _tokenB,
        uint256 _liquidity
    ) private {
        address pair = assetToAssetToPair[_tokenA][_tokenB];
        require(pair != address(0), "__removeLiquidity: this pair doesn't exist");

        uint256 amountA = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(pair, _liquidity, _tokenA)
            .div(uint256(2));

        uint256 amountB = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(pair, _liquidity, _tokenB)
            .div(uint256(2));

        address[] memory assetsToIntegratee = new address[](1);
        uint256[] memory assetsToIntegrateeAmounts = new uint256[](1);
        address[] memory assetsFromIntegratee = new address[](2);
        uint256[] memory assetsFromIntegrateeAmounts = new uint256[](2);

        assetsToIntegratee[0] = pair;
        assetsToIntegrateeAmounts[0] = _liquidity;
        assetsFromIntegratee[0] = _tokenA;
        assetsFromIntegrateeAmounts[0] = amountA;
        assetsFromIntegratee[1] = _tokenB;
        assetsFromIntegrateeAmounts[1] = amountB;

        require(
            ERC20(_tokenA).balanceOf(address(this)) >= amountA,
            "__removeLiquidity: Integratee doesn't have enough tokenA balance to cover the expected amount"
        );
        require(
            ERC20(_tokenB).balanceOf(address(this)) >= amountA,
            "__removeLiquidity: Integratee doesn't have enough tokenB balance to cover the expected amount"
        );

        __swap(
            msg.sender,
            assetsToIntegratee,
            assetsToIntegrateeAmounts,
            assetsFromIntegratee,
            assetsFromIntegrateeAmounts
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @dev By default set to address(0). It is read by UniswapV2PoolTokenValueCalculator: __calcPoolTokenValue
    function feeTo() external pure returns (address) {
        return address(0);
    }

    function getCentralizedRateProvider() public view returns (address) {
        return CENTRALIZED_RATE_PROVIDER;
    }

    function getBlockNumberDeviation() public view returns (uint256) {
        return blockNumberDeviation;
    }

    function getPrecision() public pure returns (uint256) {
        return PRECISION;
    }

    function getPair(address _token0, address _token1) public view returns (address) {
        return assetToAssetToPair[_token0][_token1];
    }
}

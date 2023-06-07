// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "../../../../../external-interfaces/IUniswapV2Pair.sol";
import "../../../../../utils/0.6.12/MathHelpers.sol";
import "../../../../utils/0.6.12/FundDeployerOwnerMixin.sol";
import "../../../value-interpreter/ValueInterpreter.sol";
import "../../utils/UniswapV2PoolTokenValueCalculator.sol";
import "../IDerivativePriceFeed.sol";

/// @title UniswapV2PoolPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed for Uniswap lending pool tokens
contract UniswapV2PoolPriceFeed is
    IDerivativePriceFeed,
    FundDeployerOwnerMixin,
    MathHelpers,
    UniswapV2PoolTokenValueCalculator
{
    event PoolTokenAdded(address indexed poolToken, address token0, address token1);

    struct PoolTokenInfo {
        address token0;
        address token1;
        uint8 token0Decimals;
        uint8 token1Decimals;
    }

    address private immutable FACTORY;
    address private immutable VALUE_INTERPRETER;

    mapping(address => PoolTokenInfo) private poolTokenToInfo;

    constructor(address _fundDeployer, address _valueInterpreter, address _factory)
        public
        FundDeployerOwnerMixin(_fundDeployer)
    {
        FACTORY = _factory;
        VALUE_INTERPRETER = _valueInterpreter;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        PoolTokenInfo memory poolTokenInfo = poolTokenToInfo[_derivative];

        underlyings_ = new address[](2);
        underlyings_[0] = poolTokenInfo.token0;
        underlyings_[1] = poolTokenInfo.token1;

        // Calculate the amounts underlying one unit of a pool token,
        // taking into account the known, trusted rate between the two underlyings
        (uint256 token0TrustedRateAmount, uint256 token1TrustedRateAmount) = __calcTrustedRate(
            poolTokenInfo.token0, poolTokenInfo.token1, poolTokenInfo.token0Decimals, poolTokenInfo.token1Decimals
        );

        (uint256 token0DenormalizedRate, uint256 token1DenormalizedRate) =
            __calcTrustedPoolTokenValue(FACTORY, _derivative, token0TrustedRateAmount, token1TrustedRateAmount);

        // Define normalized rates for each underlying
        underlyingAmounts_ = new uint256[](2);
        underlyingAmounts_[0] = _derivativeAmount.mul(token0DenormalizedRate).div(UNISWAP_V2_POOL_TOKEN_UNIT);
        underlyingAmounts_[1] = _derivativeAmount.mul(token1DenormalizedRate).div(UNISWAP_V2_POOL_TOKEN_UNIT);

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return poolTokenToInfo[_asset].token0 != address(0);
    }

    // PRIVATE FUNCTIONS

    /// @dev Calculates the trusted rate of two assets based on our price feeds.
    /// Uses the decimals-derived unit for whichever asset is used as the quote asset.
    function __calcTrustedRate(address _token0, address _token1, uint256 _token0Decimals, uint256 _token1Decimals)
        private
        returns (uint256 token0RateAmount_, uint256 token1RateAmount_)
    {
        // The quote asset of the value lookup must be a supported primitive asset,
        // so we cycle through the tokens until reaching a primitive.
        // If neither is a primitive, will revert at the ValueInterpreter
        if (IValueInterpreter(VALUE_INTERPRETER).isSupportedPrimitiveAsset(_token0)) {
            token1RateAmount_ = 10 ** _token1Decimals;
            token0RateAmount_ =
                ValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetValue(_token1, token1RateAmount_, _token0);
        } else {
            token0RateAmount_ = 10 ** _token0Decimals;
            token1RateAmount_ =
                ValueInterpreter(VALUE_INTERPRETER).calcCanonicalAssetValue(_token0, token0RateAmount_, _token1);
        }

        return (token0RateAmount_, token1RateAmount_);
    }

    //////////////////////////
    // POOL TOKENS REGISTRY //
    //////////////////////////

    /// @notice Adds Uniswap pool tokens to the price feed
    /// @param _poolTokens Uniswap pool tokens to add
    function addPoolTokens(address[] calldata _poolTokens) external onlyFundDeployerOwner {
        require(_poolTokens.length > 0, "addPoolTokens: Empty _poolTokens");

        for (uint256 i; i < _poolTokens.length; i++) {
            require(_poolTokens[i] != address(0), "addPoolTokens: Empty poolToken");
            require(poolTokenToInfo[_poolTokens[i]].token0 == address(0), "addPoolTokens: Value already set");

            IUniswapV2Pair uniswapV2Pair = IUniswapV2Pair(_poolTokens[i]);
            address token0 = uniswapV2Pair.token0();
            address token1 = uniswapV2Pair.token1();

            require(__poolTokenIsSupportable(token0, token1), "addPoolTokens: Unsupported pool token");

            poolTokenToInfo[_poolTokens[i]] = PoolTokenInfo({
                token0: token0,
                token1: token1,
                token0Decimals: ERC20(token0).decimals(),
                token1Decimals: ERC20(token1).decimals()
            });

            emit PoolTokenAdded(_poolTokens[i], token0, token1);
        }
    }

    /// @dev Helper to determine if a pool token is supportable, based on whether price feeds are
    /// available for its underlying feeds. At least one of the underlying tokens must be
    /// a supported primitive asset, and the other must be a primitive or derivative.
    function __poolTokenIsSupportable(address _token0, address _token1) private view returns (bool isSupportable_) {
        IValueInterpreter valueInterpreterContract = IValueInterpreter(VALUE_INTERPRETER);

        if (valueInterpreterContract.isSupportedPrimitiveAsset(_token0)) {
            if (valueInterpreterContract.isSupportedAsset(_token1)) {
                return true;
            }
        } else if (
            valueInterpreterContract.isSupportedDerivativeAsset(_token0)
                && valueInterpreterContract.isSupportedPrimitiveAsset(_token1)
        ) {
            return true;
        }

        return false;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FACTORY` variable value
    /// @return factory_ The `FACTORY` variable value
    function getFactory() external view returns (address factory_) {
        return FACTORY;
    }

    /// @notice Gets the `PoolTokenInfo` for a given pool token
    /// @param _poolToken The pool token for which to get the `PoolTokenInfo`
    /// @return poolTokenInfo_ The `PoolTokenInfo` value
    function getPoolTokenInfo(address _poolToken) external view returns (PoolTokenInfo memory poolTokenInfo_) {
        return poolTokenToInfo[_poolToken];
    }

    /// @notice Gets the underlyings for a given pool token
    /// @param _poolToken The pool token for which to get its underlyings
    /// @return token0_ The UniswapV2Pair.token0 value
    /// @return token1_ The UniswapV2Pair.token1 value
    function getPoolTokenUnderlyings(address _poolToken) external view returns (address token0_, address token1_) {
        return (poolTokenToInfo[_poolToken].token0, poolTokenToInfo[_poolToken].token1);
    }

    /// @notice Gets the `VALUE_INTERPRETER` variable value
    /// @return valueInterpreter_ The `VALUE_INTERPRETER` variable value
    function getValueInterpreter() external view returns (address valueInterpreter_) {
        return VALUE_INTERPRETER;
    }
}

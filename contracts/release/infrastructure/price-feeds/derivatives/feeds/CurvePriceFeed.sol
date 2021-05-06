// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../extensions/utils/FundDeployerOwnerMixin.sol";
import "../../../../interfaces/ICurveAddressProvider.sol";
import "../../../../interfaces/ICurveLiquidityGaugeToken.sol";
import "../../../../interfaces/ICurveLiquidityPool.sol";
import "../../../../interfaces/ICurveRegistry.sol";
import "../IDerivativePriceFeed.sol";

/// @title CurvePriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price feed for Curve pool tokens
contract CurvePriceFeed is IDerivativePriceFeed, FundDeployerOwnerMixin {
    using SafeMath for uint256;

    event DerivativeAdded(
        address indexed derivative,
        address indexed pool,
        address indexed invariantProxyAsset,
        uint256 invariantProxyAssetDecimals
    );

    event DerivativeRemoved(address indexed derivative);

    // Both pool tokens and liquidity gauge tokens are treated the same for pricing purposes.
    // We take one asset as representative of the pool's invariant, e.g., WETH for ETH-based pools.
    struct DerivativeInfo {
        address pool;
        address invariantProxyAsset;
        uint256 invariantProxyAssetDecimals;
    }

    uint256 private constant VIRTUAL_PRICE_UNIT = 10**18;

    address private immutable ADDRESS_PROVIDER;

    mapping(address => DerivativeInfo) private derivativeToInfo;

    constructor(address _fundDeployer, address _addressProvider)
        public
        FundDeployerOwnerMixin(_fundDeployer)
    {
        ADDRESS_PROVIDER = _addressProvider;
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        public
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        DerivativeInfo memory derivativeInfo = derivativeToInfo[_derivative];
        require(
            derivativeInfo.pool != address(0),
            "calcUnderlyingValues: _derivative is not supported"
        );

        underlyings_ = new address[](1);
        underlyings_[0] = derivativeInfo.invariantProxyAsset;

        underlyingAmounts_ = new uint256[](1);
        if (derivativeInfo.invariantProxyAssetDecimals == 18) {
            underlyingAmounts_[0] = _derivativeAmount
                .mul(ICurveLiquidityPool(derivativeInfo.pool).get_virtual_price())
                .div(VIRTUAL_PRICE_UNIT);
        } else {
            underlyingAmounts_[0] = _derivativeAmount
                .mul(ICurveLiquidityPool(derivativeInfo.pool).get_virtual_price())
                .mul(10**derivativeInfo.invariantProxyAssetDecimals)
                .div(VIRTUAL_PRICE_UNIT)
                .div(VIRTUAL_PRICE_UNIT);
        }

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return derivativeToInfo[_asset].pool != address(0);
    }

    //////////////////////////
    // DERIVATIVES REGISTRY //
    //////////////////////////

    /// @notice Adds Curve LP and/or liquidity gauge tokens to the price feed
    /// @param _derivatives Curve LP and/or liquidity gauge tokens to add
    /// @param _invariantProxyAssets The ordered assets that act as proxies to the pool invariants,
    /// corresponding to each item in _derivatives, e.g., WETH for ETH-based pools
    function addDerivatives(
        address[] calldata _derivatives,
        address[] calldata _invariantProxyAssets
    ) external onlyFundDeployerOwner {
        require(_derivatives.length > 0, "addDerivatives: Empty _derivatives");
        require(
            _derivatives.length == _invariantProxyAssets.length,
            "addDerivatives: Unequal arrays"
        );

        ICurveRegistry curveRegistryContract = ICurveRegistry(
            ICurveAddressProvider(ADDRESS_PROVIDER).get_registry()
        );

        for (uint256 i; i < _derivatives.length; i++) {
            require(_derivatives[i] != address(0), "addDerivatives: Empty derivative");
            require(
                _invariantProxyAssets[i] != address(0),
                "addDerivatives: Empty invariantProxyAsset"
            );
            require(!isSupportedAsset(_derivatives[i]), "addDerivatives: Value already set");

            // First, try assuming that the derivative is an LP token
            address pool = curveRegistryContract.get_pool_from_lp_token(_derivatives[i]);

            // If the derivative is not a valid LP token, try to treat it as a liquidity gauge token
            if (pool == address(0)) {
                // We cannot confirm whether a liquidity gauge token is a valid token
                // for a particular liquidity gauge, due to some pools using
                // old liquidity gauge contracts that did not incorporate a token
                pool = curveRegistryContract.get_pool_from_lp_token(
                    ICurveLiquidityGaugeToken(_derivatives[i]).lp_token()
                );

                // Likely unreachable as above calls will revert on Curve, but doesn't hurt
                require(
                    pool != address(0),
                    "addDerivatives: Not a valid LP token or liquidity gauge token"
                );
            }

            uint256 invariantProxyAssetDecimals = ERC20(_invariantProxyAssets[i]).decimals();
            derivativeToInfo[_derivatives[i]] = DerivativeInfo({
                pool: pool,
                invariantProxyAsset: _invariantProxyAssets[i],
                invariantProxyAssetDecimals: invariantProxyAssetDecimals
            });

            // Confirm that a non-zero price can be returned for the registered derivative
            (, uint256[] memory underlyingAmounts) = calcUnderlyingValues(
                _derivatives[i],
                1 ether
            );
            require(underlyingAmounts[0] > 0, "addDerivatives: could not calculate valid price");

            emit DerivativeAdded(
                _derivatives[i],
                pool,
                _invariantProxyAssets[i],
                invariantProxyAssetDecimals
            );
        }
    }

    /// @notice Removes Curve LP and/or liquidity gauge tokens from the price feed
    /// @param _derivatives Curve LP and/or liquidity gauge tokens to add
    function removeDerivatives(address[] calldata _derivatives) external onlyFundDeployerOwner {
        require(_derivatives.length > 0, "removeDerivatives: Empty _derivatives");
        for (uint256 i; i < _derivatives.length; i++) {
            require(_derivatives[i] != address(0), "removeDerivatives: Empty derivative");
            require(isSupportedAsset(_derivatives[i]), "removeDerivatives: Value is not set");

            delete derivativeToInfo[_derivatives[i]];

            emit DerivativeRemoved(_derivatives[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ADDRESS_PROVIDER` variable
    /// @return addressProvider_ The `ADDRESS_PROVIDER` variable value
    function getAddressProvider() external view returns (address addressProvider_) {
        return ADDRESS_PROVIDER;
    }

    /// @notice Gets the `DerivativeInfo` for a given derivative
    /// @param _derivative The derivative for which to get the `DerivativeInfo`
    /// @return derivativeInfo_ The `DerivativeInfo` value
    function getDerivativeInfo(address _derivative)
        external
        view
        returns (DerivativeInfo memory derivativeInfo_)
    {
        return derivativeToInfo[_derivative];
    }
}

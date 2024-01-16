// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IBalancerV2StablePoolPriceFeed Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IBalancerV2StablePoolPriceFeed {
    // We take one asset as representative of the pool's invariant, e.g., WETH for ETH-based pools.
    struct PoolInfo {
        address invariantProxyAsset;
        uint8 invariantProxyAssetDecimals;
    }
}

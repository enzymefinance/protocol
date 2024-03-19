// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {NonUpgradableProxy} from "../../../utils/0.8.19/NonUpgradableProxy.sol";
import {ISharePriceThrottledAssetManagerLib} from "./ISharePriceThrottledAssetManagerLib.sol";

/// @title SharePriceThrottledAssetManagerFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A factory for SharePriceThrottledAssetManager proxy instances
contract SharePriceThrottledAssetManagerFactory {
    event ProxyDeployed(
        address indexed deployer,
        address proxyAddress,
        address indexed owner,
        address indexed vaultProxy,
        uint64 lossTolerance,
        uint32 lossTolerancePeriodDuration,
        address shutDowner
    );

    address internal immutable LIB_ADDRESS;

    constructor(address _libAddress) {
        LIB_ADDRESS = _libAddress;
    }

    /// @notice Deploys a new SharePriceThrottledAssetManager proxy instance
    /// @param _owner The owner (signer) of the instance
    /// @param _vaultProxyAddress The VaultProxy that the instance will be associated with
    /// @param _lossTolerance The cumulative percentage loss tolerated (1e18 is 100%)
    /// @param _lossTolerancePeriodDuration The length of the period (in seconds) used in cumulative loss tolerance calculations
    /// @param _shutdowner The admin who can shut down the smart account
    /// @return proxyAddress_ The newly-deployed instance
    function deployProxy(
        address _owner,
        address _vaultProxyAddress,
        uint64 _lossTolerance,
        uint32 _lossTolerancePeriodDuration,
        address _shutdowner
    ) external returns (address proxyAddress_) {
        bytes memory constructData = abi.encodeWithSelector(
            ISharePriceThrottledAssetManagerLib.init.selector,
            _owner,
            _vaultProxyAddress,
            _lossTolerance,
            _lossTolerancePeriodDuration,
            _shutdowner
        );

        proxyAddress_ = address(new NonUpgradableProxy({_constructData: constructData, _contractLogic: LIB_ADDRESS}));

        emit ProxyDeployed(
            msg.sender,
            proxyAddress_,
            _owner,
            _vaultProxyAddress,
            _lossTolerance,
            _lossTolerancePeriodDuration,
            _shutdowner
        );

        return proxyAddress_;
    }
}

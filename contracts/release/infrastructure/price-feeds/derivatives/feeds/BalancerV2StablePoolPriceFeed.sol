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
import "../../../../../external-interfaces/IBalancerV2PoolFactory.sol";
import "../../../../../external-interfaces/IBalancerV2StablePool.sol";
import "../../../../../external-interfaces/IBalancerV2Vault.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/FundDeployerOwnerMixin.sol";
import "../IDerivativePriceFeed.sol";

/// @title BalancerV2StablePoolPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Balancer Pool Tokens (BPT) of stable pools
contract BalancerV2StablePoolPriceFeed is IDerivativePriceFeed, FundDeployerOwnerMixin {
    using AddressArrayLib for address[];
    using SafeMath for uint256;

    event PoolAdded(address indexed pool, address indexed invariantProxyAsset);

    event PoolFactoryAdded(address indexed poolFactory);

    event PoolFactoryRemoved(address indexed poolFactory);

    event PoolRemoved(address indexed pool);

    // We take one asset as representative of the pool's invariant, e.g., WETH for ETH-based pools.
    struct PoolInfo {
        address invariantProxyAsset;
        uint8 invariantProxyAssetDecimals;
        bool containsNativeAsset;
    }

    // The pricing requires dividing by 1e18 twice, once for converting decimal precision, and then for converting rate precision
    uint256 private constant RATE_FORMULA_DIVISOR = 10**36;

    IBalancerV2Vault private immutable BALANCER_VAULT_CONTRACT;
    address private immutable WRAPPED_NATIVE_ASSET;

    address[] private poolFactories;
    mapping(address => PoolInfo) private poolToPoolInfo;

    constructor(
        address _fundDeployer,
        address _wrappedNativeAsset,
        address _balancerVault,
        address[] memory _poolFactories
    ) public FundDeployerOwnerMixin(_fundDeployer) {
        BALANCER_VAULT_CONTRACT = IBalancerV2Vault(_balancerVault);
        WRAPPED_NATIVE_ASSET = _wrappedNativeAsset;

        __addPoolFactories(_poolFactories);
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
        PoolInfo memory poolInfo = getPoolInfo(_derivative);

        // Since Balancer pools are already incompatible with reentrant tokens,
        // the only reentrancy that needs to be considered is a pool containing the native asset,
        // as Balancer allows wrapping/unwrapping the native asset for join/exit
        if (poolInfo.containsNativeAsset) {
            // This is a non-reentrant call that has no state-changing effects given the params used.
            // It prevents important pricing functions from being called during a Balancer pool join/exit.
            BALANCER_VAULT_CONTRACT.setRelayerApproval(address(this), address(0), false);
        }

        underlyings_ = new address[](1);
        underlyingAmounts_ = new uint256[](1);

        underlyings_[0] = poolInfo.invariantProxyAsset;
        underlyingAmounts_[0] = _derivativeAmount
            .mul(IBalancerV2StablePool(_derivative).getRate())
            .mul(10**uint256(poolInfo.invariantProxyAssetDecimals))
            .div(RATE_FORMULA_DIVISOR);

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) public view override returns (bool isSupported_) {
        return getPoolInfo(_asset).invariantProxyAsset != address(0);
    }

    //////////////////////
    // FACTORY REGISTRY //
    //////////////////////

    /// @notice Adds pool factories
    /// @param _poolFactories Pool factories to add
    function addPoolFactories(address[] calldata _poolFactories) external onlyFundDeployerOwner {
        __addPoolFactories(_poolFactories);
    }

    /// @notice Removes pool factories
    /// @param _poolFactories Pool factories to remove
    function removePoolFactories(address[] calldata _poolFactories)
        external
        onlyFundDeployerOwner
    {
        for (uint256 i; i < _poolFactories.length; i++) {
            if (poolFactories.removeStorageItem(_poolFactories[i])) {
                emit PoolFactoryRemoved(_poolFactories[i]);
            }
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper function that adds pool factories
    function __addPoolFactories(address[] memory _poolFactories) private {
        for (uint256 i; i < _poolFactories.length; i++) {
            if (!poolFactories.storageArrayContains(_poolFactories[i])) {
                poolFactories.push(_poolFactories[i]);

                emit PoolFactoryAdded(_poolFactories[i]);
            }
        }
    }

    ///////////////////
    // POOL REGISTRY //
    ///////////////////

    /// @notice Adds Balancer pool info to the price feed
    /// @param _pools The ordered Balancer pools (BPTs)
    /// @param _invariantProxyAssets The ordered invariant proxy assets corresponding to _pools,
    /// e.g., WETH for ETH-based pools
    function addPools(address[] calldata _pools, address[] calldata _invariantProxyAssets)
        external
        onlyFundDeployerOwner
    {
        require(_pools.length == _invariantProxyAssets.length, "addPools: Unequal arrays");

        for (uint256 i; i < _pools.length; i++) {
            require(!isSupportedAsset(_pools[i]), "addPools: Already registered");
            require(__isPoolFromFactory(_pools[i]), "addPools: Invalid factory");

            (address[] memory poolTokens, , ) = BALANCER_VAULT_CONTRACT.getPoolTokens(
                IBalancerV2StablePool(_pools[i]).getPoolId()
            );

            poolToPoolInfo[_pools[i]] = PoolInfo({
                invariantProxyAsset: _invariantProxyAssets[i],
                invariantProxyAssetDecimals: ERC20(_invariantProxyAssets[i]).decimals(),
                containsNativeAsset: poolTokens.contains(WRAPPED_NATIVE_ASSET)
            });

            emit PoolAdded(_pools[i], _invariantProxyAssets[i]);
        }
    }

    /// @notice Removes Balancer pools from the price feed
    /// @param _pools The Balancer pools (BPTs) to remove
    /// @dev Unlikely to be needed, just in case of bad storage entry
    function removePools(address[] calldata _pools) external onlyFundDeployerOwner {
        for (uint256 i; i < _pools.length; i++) {
            if (isSupportedAsset(_pools[i])) {
                delete poolToPoolInfo[_pools[i]];

                emit PoolRemoved(_pools[i]);
            }
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to check if _pool is from a pool factory
    function __isPoolFromFactory(address _pool) private view returns (bool _success) {
        for (uint256 i; i < poolFactories.length; i++) {
            if (IBalancerV2PoolFactory(poolFactories[i]).isPoolFromFactory(_pool)) {
                return true;
            }
        }

        return false;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Gets the stored pool factory addresses
    /// @return factories_ Factory addresses
    function getPoolFactories() external view returns (address[] memory factories_) {
        return poolFactories;
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the stored PoolInfo for a given pool
    /// @param _pool The Balancer pool (BPT)
    /// @return poolInfo_ The PoolInfo
    function getPoolInfo(address _pool) public view returns (PoolInfo memory poolInfo_) {
        return poolToPoolInfo[_pool];
    }
}

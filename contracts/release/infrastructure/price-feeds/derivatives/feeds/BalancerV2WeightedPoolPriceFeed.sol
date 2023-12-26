// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IBalancerV2WeightedPool} from "../../../../../external-interfaces/IBalancerV2WeightedPool.sol";
import {IBalancerV2PoolFactory} from "../../../../../external-interfaces/IBalancerV2PoolFactory.sol";
import {IBalancerV2Vault} from "../../../../../external-interfaces/IBalancerV2Vault.sol";
import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {AddressArrayLib} from "../../../../../utils/0.6.12/AddressArrayLib.sol";
import {BalancerV2LogExpMath} from "../../../../../utils/0.6.12/BalancerV2LogExpMath.sol";
import {BalancerV2FixedPoint} from "../../../../../utils/0.6.12/BalancerV2FixedPoint.sol";
import {FundDeployerOwnerMixin} from "../../../../utils/0.6.12/FundDeployerOwnerMixin.sol";
import {IValueInterpreter} from "../../../value-interpreter/IValueInterpreter.sol";
import {IDerivativePriceFeed} from "../IDerivativePriceFeed.sol";

/// @title BalancerV2WeightedPoolPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Balancer Pool Tokens (BPT) of weighted pools
contract BalancerV2WeightedPoolPriceFeed is IDerivativePriceFeed, FundDeployerOwnerMixin {
    using AddressArrayLib for address[];
    using BalancerV2FixedPoint for uint256;
    using BalancerV2LogExpMath for uint256;

    event PoolFactoryAdded(address poolFactory);

    event PoolFactoryRemoved(address poolFactory);

    uint256 private constant POOL_TOKEN_UNIT = 10 ** 18;

    IBalancerV2Vault private immutable BALANCER_VAULT_CONTRACT;
    address private immutable INTERMEDIARY_ASSET;
    IValueInterpreter private immutable VALUE_INTERPRETER_CONTRACT;

    address[] private poolFactories;

    constructor(
        address _fundDeployer,
        address _valueInterpreter,
        address _intermediaryAsset,
        address _balancerVault,
        address[] memory _poolFactories
    ) public FundDeployerOwnerMixin(_fundDeployer) {
        BALANCER_VAULT_CONTRACT = IBalancerV2Vault(_balancerVault);
        INTERMEDIARY_ASSET = _intermediaryAsset;
        VALUE_INTERPRETER_CONTRACT = IValueInterpreter(_valueInterpreter);

        __addPoolFactories(_poolFactories);
    }

    /// @notice Converts a given amount of a derivative to its underlying asset values
    /// @param _derivative The derivative to convert
    /// @param _derivativeAmount The amount of the derivative to convert
    /// @return underlyings_ The underlying assets for the _derivative
    /// @return underlyingAmounts_ The amount of each underlying asset for the equivalent derivative amount
    /// @dev The underlyings returned from this function does not correspond to the real underlyings of the Balancer Pool Token.
    /// Instead, we return the value of the derivative in a single asset, which is the INTERMEDIARY_ASSET.
    /// This saves a considerable amount of gas, while returning the same total value.
    /// Pricing formula: https://dev.balancer.fi/references/lp-tokens/valuing#estimating-price-robustly-on-chain
    function calcUnderlyingValues(address _derivative, uint256 _derivativeAmount)
        external
        override
        returns (address[] memory underlyings_, uint256[] memory underlyingAmounts_)
    {
        // This is a non-reentrant call that has no state-changing effects given the params used.
        // It prevents important pricing functions from being called during a Balancer pool join/exit.
        BALANCER_VAULT_CONTRACT.setRelayerApproval(address(this), address(0), false);

        (address[] memory poolTokens,,) =
            BALANCER_VAULT_CONTRACT.getPoolTokens(IBalancerV2WeightedPool(_derivative).getPoolId());

        underlyings_ = new address[](1);
        underlyingAmounts_ = new uint256[](1);

        uint256 totalSupply = IERC20(_derivative).totalSupply();
        uint256 invariant = IBalancerV2WeightedPool(_derivative).getInvariant();
        uint256[] memory weights = IBalancerV2WeightedPool(_derivative).getNormalizedWeights();

        // the geometricWeightedMean will be calculated iteratively in the for loop
        uint256 geometricWeightedMean = POOL_TOKEN_UNIT;

        for (uint256 i; i < poolTokens.length; i++) {
            uint256 price = VALUE_INTERPRETER_CONTRACT.calcCanonicalAssetValue(
                poolTokens[i], 10 ** (uint256(IERC20(poolTokens[i]).decimals())), INTERMEDIARY_ASSET
            );
            geometricWeightedMean =
                geometricWeightedMean.mulUp((price.pow(weights[i])).divUp(weights[i].pow(weights[i])));
        }

        uint256 priceLP = geometricWeightedMean.mulUp(invariant).divUp(totalSupply);

        underlyings_[0] = INTERMEDIARY_ASSET;

        underlyingAmounts_[0] = _derivativeAmount.mulUp(priceLP);

        return (underlyings_, underlyingAmounts_);
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        for (uint256 i; i < poolFactories.length; i++) {
            if (IBalancerV2PoolFactory(poolFactories[i]).isPoolFromFactory(_asset)) {
                return true;
            }
        }
        return false;
    }

    /// @notice Adds pool factories
    /// @param _poolFactories pool factories to add
    function addPoolFactories(address[] calldata _poolFactories) external onlyFundDeployerOwner {
        __addPoolFactories(_poolFactories);
    }

    /// @notice Removes pool factories
    /// @param _poolFactories pool factories to remove
    function removePoolFactories(address[] calldata _poolFactories) external onlyFundDeployerOwner {
        for (uint256 i; i < _poolFactories.length; i++) {
            if (poolFactories.removeStorageItem(_poolFactories[i])) {
                emit PoolFactoryRemoved(_poolFactories[i]);
            }
        }
    }

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
    // STATE GETTERS //
    ///////////////////

    /// @notice Returns stored balancer pool factory contract addresses
    /// @return factories_ array of stored pool factory contract addresses
    function getPoolFactories() external view returns (address[] memory factories_) {
        return poolFactories;
    }
}

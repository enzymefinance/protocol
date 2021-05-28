// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/IYearnVaultV2.sol";
import "../../../../interfaces/IYearnVaultV2Registry.sol";
import "../IDerivativePriceFeed.sol";
import "./utils/SingleUnderlyingDerivativeRegistryMixin.sol";

/// @title YearnVaultV2PriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Yearn Vault V2 shares
contract YearnVaultV2PriceFeed is IDerivativePriceFeed, SingleUnderlyingDerivativeRegistryMixin {
    using SafeMath for uint256;

    address private immutable YEARN_VAULT_V2_REGISTRY;

    constructor(address _fundDeployer, address _yearnVaultV2Registry)
        public
        SingleUnderlyingDerivativeRegistryMixin(_fundDeployer)
    {
        YEARN_VAULT_V2_REGISTRY = _yearnVaultV2Registry;
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
        underlyings_ = new address[](1);
        underlyings_[0] = getUnderlyingForDerivative(_derivative);
        require(underlyings_[0] != address(0), "calcUnderlyingValues: Unsupported derivative");

        underlyingAmounts_ = new uint256[](1);
        underlyingAmounts_[0] = _derivativeAmount
            .mul(IYearnVaultV2(_derivative).pricePerShare())
            .div(10**uint256(ERC20(_derivative).decimals()));
    }

    /// @notice Checks if an asset is supported by the price feed
    /// @param _asset The asset to check
    /// @return isSupported_ True if the asset is supported
    function isSupportedAsset(address _asset) external view override returns (bool isSupported_) {
        return getUnderlyingForDerivative(_asset) != address(0);
    }

    /// @dev Helper to validate the derivative-underlying pair.
    /// Inherited from SingleUnderlyingDerivativeRegistryMixin.
    function __validateDerivative(address _derivative, address _underlying) internal override {
        // Only validate that the _derivative is a valid yVault using the V2 contract,
        // not that it is the latest vault for a particular _underlying
        bool isValidYearnVaultV2;
        IYearnVaultV2Registry yearnRegistryContract = IYearnVaultV2Registry(
            getYearnVaultV2Registry()
        );
        for (uint256 i; i < yearnRegistryContract.numVaults(_underlying); i++) {
            if (yearnRegistryContract.vaults(_underlying, i) == _derivative) {
                isValidYearnVaultV2 = true;
                break;
            }
        }
        require(isValidYearnVaultV2, "__validateDerivative: Invalid yVault for underlying");

        // Validates our assumption that yVaults and underlyings will have the same decimals
        require(
            ERC20(_derivative).decimals() == ERC20(_underlying).decimals(),
            "__validateDerivative: Incongruent decimals"
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `YEARN_VAULT_V2_REGISTRY` variable
    /// @return yearnVaultV2Registry_ The `YEARN_VAULT_V2_REGISTRY` variable value
    function getYearnVaultV2Registry() public view returns (address yearnVaultV2Registry_) {
        return YEARN_VAULT_V2_REGISTRY;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IIdleTokenV4.sol";
import "../IDerivativePriceFeed.sol";
import "./utils/SingleUnderlyingDerivativeRegistryMixin.sol";

/// @title IdlePriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for IdleTokens
contract IdlePriceFeed is IDerivativePriceFeed, SingleUnderlyingDerivativeRegistryMixin {
    using SafeMath for uint256;

    uint256 private constant IDLE_TOKEN_UNIT = 10**18;

    constructor(address _fundDeployer)
        public
        SingleUnderlyingDerivativeRegistryMixin(_fundDeployer)
    {}

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
        underlyingAmounts_[0] = _derivativeAmount.mul(IIdleTokenV4(_derivative).tokenPrice()).div(
            IDLE_TOKEN_UNIT
        );
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
        require(
            IIdleTokenV4(_derivative).token() == _underlying,
            "__validateDerivative: Invalid underlying for IdleToken"
        );
    }
}

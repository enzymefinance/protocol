// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IValueInterpreter interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for ValueInterpreter
interface IValueInterpreter {
    function calcCanonicalAssetValue(address _baseAsset, uint256 _amount, address _quoteAsset)
        external
        returns (uint256 value_);

    function calcCanonicalAssetsTotalValue(address[] memory _baseAssets, uint256[] memory _amounts, address _quoteAsset)
        external
        returns (uint256 value_);

    function isSupportedAsset(address _asset) external view returns (bool isSupported_);

    function isSupportedDerivativeAsset(address _asset) external view returns (bool isSupported_);

    function isSupportedPrimitiveAsset(address _asset) external view returns (bool isSupported_);
}

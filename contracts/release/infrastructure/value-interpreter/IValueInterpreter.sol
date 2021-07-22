// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IValueInterpreter interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for ValueInterpreter
interface IValueInterpreter {
    function calcCanonicalAssetValue(
        address,
        uint256,
        address
    ) external returns (uint256);

    function calcCanonicalAssetsTotalValue(
        address[] calldata,
        uint256[] calldata,
        address
    ) external returns (uint256);

    function isSupportedAsset(address) external view returns (bool);

    function isSupportedDerivativeAsset(address) external view returns (bool);

    function isSupportedPrimitiveAsset(address) external view returns (bool);
}

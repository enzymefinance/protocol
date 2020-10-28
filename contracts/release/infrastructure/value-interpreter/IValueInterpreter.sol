// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IValueInterpreter interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IValueInterpreter {
    function calcCanonicalAssetValue(
        address,
        uint256,
        address
    ) external returns (uint256, bool);

    function calcCanonicalAssetsTotalValue(
        address[] calldata,
        uint256[] calldata,
        address
    ) external returns (uint256, bool);

    function calcLiveAssetValue(
        address,
        uint256,
        address
    ) external returns (uint256, bool);

    function calcLiveAssetsTotalValue(
        address[] calldata,
        uint256[] calldata,
        address
    ) external returns (uint256, bool);

    function isSupportedAsset(address) external view returns (bool);
}

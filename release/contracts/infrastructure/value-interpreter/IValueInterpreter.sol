// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IValueInterpreter interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IValueInterpreter {
    function calcCanonicalAssetValue(
        address,
        address,
        address,
        uint256,
        address
    ) external returns (uint256, bool);

    function calcLiveAssetValue(
        address,
        address,
        address,
        uint256,
        address
    ) external returns (uint256, bool);
}

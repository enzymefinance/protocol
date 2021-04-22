// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../persistent/utils/IMigratableVault.sol";

/// @title IVault Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IVault is IMigratableVault {
    function addCollateralAssets(
        address,
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function addDebtPosition(address) external;

    function addTrackedAsset(address) external;

    function approveAssetSpender(
        address,
        address,
        uint256
    ) external;

    function borrowAssets(
        address,
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function burnShares(address, uint256) external;

    function callOnContract(address, bytes calldata) external;

    function getAccessor() external view returns (address);

    function getOwner() external view returns (address);

    function getActiveDebtPositions() external view returns (address[] memory);

    function getTrackedAssets() external view returns (address[] memory);

    function isActiveDebtPosition(address _asset) external view returns (bool);

    function isTrackedAsset(address) external view returns (bool);

    function mintShares(address, uint256) external;

    function removeCollateralAssets(
        address,
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function removeDebtPosition(address) external;

    function removeTrackedAsset(address) external;

    function repayBorrowedAssets(
        address,
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function transferShares(
        address,
        address,
        uint256
    ) external;

    function withdrawAssetTo(
        address,
        address,
        uint256
    ) external;
}

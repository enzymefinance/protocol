// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

interface IDebtPosition {
    function addCollateralAssets(
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function borrowAssets(
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function getCollateralAssets() external returns (address[] memory, uint256[] memory);

    function getBorrowedAssets() external returns (address[] memory, uint256[] memory);

    function removeCollateralAssets(
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;

    function repayBorrowedAssets(
        address[] memory,
        uint256[] memory,
        bytes memory
    ) external;
}

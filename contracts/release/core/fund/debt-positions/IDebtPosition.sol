// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

interface IDebtPosition {
    enum DebtPositionActions {AddCollateral, RemoveCollateral, Borrow, RepayBorrow}

    function getCollateralAssets() external returns (address[] memory, uint256[] memory);

    function getBorrowedAssets() external returns (address[] memory, uint256[] memory);

    function init(bytes memory) external;

    function receiveCallFromVault(bytes memory) external;
}

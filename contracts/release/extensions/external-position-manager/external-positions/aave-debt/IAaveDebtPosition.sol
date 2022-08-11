// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../../../../persistent/external-positions/IExternalPosition.sol";

pragma solidity 0.6.12;

/// @title IAaveDebtPosition Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IAaveDebtPosition is IExternalPosition {
    enum Actions {
        AddCollateral,
        RemoveCollateral,
        Borrow,
        RepayBorrow,
        ClaimRewards
    }

    function getDebtTokenForBorrowedAsset(address) external view returns (address);
}

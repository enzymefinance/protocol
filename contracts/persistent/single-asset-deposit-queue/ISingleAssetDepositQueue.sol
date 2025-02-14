// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ISingleAssetDepositQueue Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface ISingleAssetDepositQueue {
    /// @dev Request struct to store request info
    /// @param user The user who made the request
    /// @param canCancelTime The time when the request can be canceled
    /// @param depositAssetAmount The amount of asset to deposit
    struct Request {
        address user;
        uint96 canCancelTime;
        uint256 depositAssetAmount;
    }
}

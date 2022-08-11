// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title FeeManager Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Interface for the FeeManager
interface IFeeManager {
    // No fees for the current release are implemented post-redeemShares
    enum FeeHook {
        Continuous,
        PreBuyShares,
        PostBuyShares,
        PreRedeemShares
    }
    enum SettlementType {
        None,
        Direct,
        Mint,
        Burn,
        MintSharesOutstanding,
        BurnSharesOutstanding
    }

    function invokeHook(
        FeeHook,
        bytes calldata,
        uint256
    ) external;
}

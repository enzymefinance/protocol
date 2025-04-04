// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IEnzymeV4VaultAdapter interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IEnzymeV4VaultAdapter {
    enum Action {
        BuyShares,
        RedeemSharesForSpecificAssets
    }

    /// @dev BuyShares action args to perform a deposit into an Enzyme Vault
    /// @param vaultProxy The VaultProxy address of the Vault to deposit into
    /// @param investmentAmount The amount of the denomination asset to deposit
    /// @param minSharesQuantity The minimum quantity of shares we expect to receive for the investment
    struct BuySharesActionArgs {
        address vaultProxy;
        uint256 investmentAmount;
        uint256 minSharesQuantity;
    }

    /// @dev RedeemSharesForSpecificAssets action args to perform a redemption from an Enzyme Vault
    /// @param vaultProxy The VaultProxy address of the Vault to redeem from
    /// @param sharesQuantity The quantity of shares to redeem
    /// @param payoutAssets The assets to payout
    /// @param payoutAssetPercentages The percentage of the owed amount to pay out in each asset
    /// @param minPayoutAssetAmounts The minimum asset amounts of the payout asset to receive
    struct RedeemSharesForSpecificAssetsActionArgs {
        address vaultProxy;
        uint256 sharesQuantity;
        address[] payoutAssets;
        uint256[] payoutAssetPercentages;
        uint256[] minPayoutAssetAmounts;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IEnzymeVaultAdapter interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IEnzymeVaultAdapter {
    enum Action {
        BuyShares,
        RedeemShares
    }

    /// @dev BuyShares action args to perform a deposit into an Enzyme Vault
    /// @param vaultProxy The VaultProxy address of the Vault to deposit into
    /// @param denominationAsset The denomination asset of the Vault that we deposit into
    /// @param investmentAmount The amount of the denomination asset to deposit
    /// @param minSharesQuantity The minimum quantity of shares we expect to receive for the investment
    struct BuySharesActionArgs {
        address vaultProxy;
        address denominationAsset;
        uint256 investmentAmount;
        uint256 minSharesQuantity;
    }

    /// @dev RedeemShares action args to perform a redemption from an Enzyme Vault
    /// @param vaultProxy The VaultProxy address of the Vault to redeem from
    /// @param sharesQuantity The quantity of shares to redeem
    /// @param payoutAsset The asset to receive as a result of the redemption
    /// @param minPayoutAssetAmount The minimum amount of the payout asset to receive
    struct RedeemSharesActionArgs {
        address vaultProxy;
        uint256 sharesQuantity;
        address payoutAsset;
        uint256 minPayoutAssetAmount;
    }
}

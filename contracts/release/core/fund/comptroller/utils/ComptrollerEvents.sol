// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title ComptrollerEvents Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Contract containing all the events used in the Comptroller contracts
abstract contract ComptrollerEvents {
    event MigratedSharesDuePaid(uint256 sharesDue);

    event OverridePauseSet(bool indexed overridePause);

    event PreRedeemSharesHookFailed(
        bytes failureReturnData,
        address redeemer,
        uint256 sharesQuantity
    );

    event SharesBought(
        address indexed caller,
        address indexed buyer,
        uint256 investmentAmount,
        uint256 sharesBought,
        uint256 sharesReceived
    );

    event SharesRedeemed(
        address indexed redeemer,
        uint256 sharesQuantity,
        address[] receivedAssets,
        uint256[] receivedAssetQuantities
    );

    event VaultProxySet(address vaultProxy);
}

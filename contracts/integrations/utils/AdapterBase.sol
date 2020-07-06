// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../dependencies/token/IERC20.sol";
import "../../dependencies/TokenUser.sol";
import "../../fund/hub/Hub.sol";
import "../../fund/hub/Spoke.sol";
import "../../fund/hub/SpokeCallee.sol";
import "../../registry/Registry.sol";
import "../IIntegrationAdapter.sol";
import "./IntegrationSignatures.sol";

/// @title AdapterBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A base contract for integration adapters
abstract contract AdapterBase is IIntegrationAdapter, IntegrationSignatures, SpokeCallee, TokenUser {
    address immutable public REGISTRY;

    /// @dev Provides a standard implementation for transferring assets between
    /// the fund and the adapter, by wrapping the adapter action.
    /// This modifier should be implemented in almost all adapter actions that do not require
    /// special transfer logic (e.g., ignoring transfer requirements)
    modifier fundAssetsTransferHandler(bytes memory _encodedAssetTransferArgs) {
        (
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = abi.decode(
            _encodedAssetTransferArgs,
            (
                address[],
                uint256[],
                address[]
            )
        );

        // Sanity check
        require(
            spendAssets.length == spendAssetAmounts.length,
            "fundAssetsTransferHandler: spend assets arrays unequal"
        );

        // Spend assets
        uint256[] memory spentAssetPreCallAmounts = new uint256[](spendAssets.length);
        for (uint256 i = 0; i < spendAssets.length; i++) {
            // Sanity checks
            require(
                spendAssets[i] != address(0),
                "fundAssetsTransferHandler: spend asset cannot be empty"
            );
            require(
                spendAssetAmounts[i] > 0,
                "fundAssetsTransferHandler: spend asset amount must be >0"
            );

            spentAssetPreCallAmounts[i] = IERC20(spendAssets[i]).balanceOf(address(this));

            // Custody asset
            __safeTransferFrom(spendAssets[i], msg.sender, address(this), spendAssetAmounts[i]);
        }

        // Get incoming asset balances before call
        uint256[] memory incomingAssetPreCallAmounts = new uint256[](incomingAssets.length);
        for (uint256 i = 0; i < incomingAssets.length; i++) {
            require(
                incomingAssets[i] != address(0),
                "fundAssetsTransferHandler: incoming asset cannot be empty"
            );
            incomingAssetPreCallAmounts[i] = IERC20(incomingAssets[i]).balanceOf(address(this));
        }

        // Execute call
        _;

        // Transfer incoming assets back to fund
        for (uint256 i = 0; i < incomingAssets.length; i++) {
            uint256 postCallAmount = IERC20(incomingAssets[i]).balanceOf(address(this));
            // Allow incoming asset balance diff to be 0 or negative in case adapters
            // can send assets directly to the Vault
            if (postCallAmount <= incomingAssetPreCallAmounts[i]) continue;

            __safeTransfer(
                incomingAssets[i],
                msg.sender,
                sub(postCallAmount, incomingAssetPreCallAmounts[i])
            );
        }

        // If excess spend assets, send back to fund
        for (uint256 i = 0; i < spendAssets.length; i++) {
            uint256 postCallAmount = IERC20(spendAssets[i]).balanceOf(address(this));
            if (postCallAmount > spentAssetPreCallAmounts[i]) {
                __safeTransfer(
                    spendAssets[i],
                    msg.sender,
                    sub(postCallAmount, spentAssetPreCallAmounts[i])
                );
            }
        }
    }

    modifier onlyVault {
        require(__isVault(msg.sender), "Only Vault can make this call");
        _;
    }

    constructor(address _registry) public {
        REGISTRY = _registry;
    }

    // INTERNAL FUNCTIONS

    /// @dev Aggregates a list of _assets and _amounts, removing duplicate assets and summing their amounts.
    /// At present, this is only used to aggregate fees in integration adapters.
    /// e.g., in 0x v3, if the takerFee asset is WETH, then takerFee and protocolFee are aggregated.
    /// It remove assets with an empty address or a balance of 0, so adapters can be dumb.
    function __aggregateAssets(address[] memory _assets, uint256[] memory _amounts)
        internal
        pure
        returns (
            address[] memory aggregatedAssets_,
            uint256[] memory aggregatedAssetAmounts_
        )
    {
        // Get count of unique assets with non-zero values
        uint256 aggregatedAssetsCount;
        for (uint256 i = 0; i < _assets.length; i++) {
            // Ignore assets with a 0 address, 0 amount
            if (_assets[i] == address(0) || _amounts[i] == 0) continue;

            // Ignore assets that have already been added
            bool assetAdded;
            for (uint256 j = 0; j < i; j++) {
                // Prev asset in array must have non-zero amount
                if (_assets[i] == _assets[j] && _amounts[j] > 0) {
                    assetAdded = true;
                    break;
                }
            }
            if (!assetAdded) aggregatedAssetsCount++;
        }
        aggregatedAssets_ = new address[](aggregatedAssetsCount);
        aggregatedAssetAmounts_ = new uint256[](aggregatedAssetsCount);
        if (aggregatedAssetsCount == 0) return (aggregatedAssets_, aggregatedAssetAmounts_);

        uint256 aggregatedAssetIndex;
        for (uint256 i = 0; i < _assets.length; i++) {
            if (_assets[i] == address(0) || _amounts[i] == 0) continue;

            bool assetAdded;
            for (uint256 j = 0; j < aggregatedAssets_.length; j++) {
                if (aggregatedAssets_[j] == address(0)) break; // If address(0), no more array items
                if (_assets[i] == aggregatedAssets_[j]) {
                    aggregatedAssetAmounts_[j] = add(aggregatedAssetAmounts_[j], _amounts[i]);
                    assetAdded = true;
                    break;
                }
            }
            if (!assetAdded) {
                aggregatedAssets_[aggregatedAssetIndex] = _assets[i];
                aggregatedAssetAmounts_[aggregatedAssetIndex] = _amounts[i];
                aggregatedAssetIndex++;
            }
        }
    }

    /// @notice Helper to determine whether an address is a valid Vault component
    function __isVault(address _who) internal view returns (bool) {
        // 1. Is valid Spoke of a Registered fund
        // 2. Is the vault of the registered fund
        try Spoke(_who).HUB() returns (address hub) {
            return Registry(REGISTRY).fundIsRegistered(hub) && __getVault(hub) == _who;
        }
        catch {
            return false;
        }
    }
}

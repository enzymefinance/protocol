// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/AdapterBase.sol";

/// @title TrackedAssetsAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter to add tracked assets to a fund
contract TrackedAssetsAdapter is AdapterBase {
    constructor(address _integrationManager) public AdapterBase(_integrationManager) {}

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "TRACKED_ASSETS";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        view
        override
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == ADD_TRACKED_ASSETS_SELECTOR) {
            incomingAssets_ = __decodeCallArgs(_encodedCallArgs);

            minIncomingAssetAmounts_ = new uint256[](incomingAssets_.length);
            for (uint256 i; i < minIncomingAssetAmounts_.length; i++) {
                minIncomingAssetAmounts_[i] = 1;
            }
        } else {
            revert("parseIncomingAssets: _selector invalid");
        }

        return (spendAssets_, spendAssetAmounts_, incomingAssets_, minIncomingAssetAmounts_);
    }

    /// @notice Add multiple assets to the Vault's owned assets
    function addTrackedAssets(
        address,
        bytes calldata,
        bytes calldata
    ) external onlyIntegrationManager {}

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (address[] memory incomingAsset_)
    {
        return abi.decode(_encodedCallArgs, (address[]));
    }
}

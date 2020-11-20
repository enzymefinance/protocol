// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/ISynthetix.sol";
import "../../../../interfaces/ISynthetixAddressResolver.sol";
import "../../../../utils/SynthetixHelper.sol";
import "../utils/AdapterBase.sol";

/// @title SynthetixAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for interacting with Synthetix
contract SynthetixAdapter is AdapterBase, SynthetixHelper {
    address private immutable ADDRESS_RESOLVER;
    address private immutable ORIGINATOR;
    bytes32 private immutable TRACKING_CODE;

    constructor(
        address _integrationManager,
        address _addressResolver,
        address _originator,
        bytes32 _trackingCode
    ) public AdapterBase(_integrationManager) {
        ADDRESS_RESOLVER = _addressResolver;
        ORIGINATOR = _originator;
        TRACKING_CODE = _trackingCode;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "SYNTHETIX";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        require(_selector == TAKE_ORDER_SELECTOR, "parseIncomingAssets: _selector invalid");
        (
            address incomingAsset,
            uint256 minIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingAsset;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingAsset;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.None,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Trades assets on Synthetix
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    function takeOrder(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            address incomingAsset,
            ,
            address outgoingAsset,
            uint256 outgoingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        // Validate args
        require(outgoingAssetAmount > 0, "takeOrder: outgoingAssetAmount must be >0");

        address synthetix = ISynthetixAddressResolver(ADDRESS_RESOLVER).requireAndGetAddress(
            "Synthetix",
            "takeOrder: Missing Synthetix"
        );

        ISynthetix(synthetix).exchangeOnBehalfWithTracking(
            _vaultProxy,
            getCurrencyKey(outgoingAsset),
            outgoingAssetAmount,
            getCurrencyKey(incomingAsset),
            ORIGINATOR,
            TRACKING_CODE
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address incomingAsset_,
            uint256 minIncomingAssetAmount_,
            address outgoingAsset_,
            uint256 outgoingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, uint256, address, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getAddressResolver() external view returns (address) {
        return ADDRESS_RESOLVER;
    }

    function getOriginator() external view returns (address) {
        return ORIGINATOR;
    }

    function getTrackingCode() external view returns (bytes32) {
        return TRACKING_CODE;
    }
}

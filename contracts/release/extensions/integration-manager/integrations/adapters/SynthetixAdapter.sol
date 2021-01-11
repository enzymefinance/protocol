// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/price-feeds/derivatives/feeds/SynthetixPriceFeed.sol";
import "../../../../interfaces/ISynthetix.sol";
import "../utils/AdapterBase.sol";

/// @title SynthetixAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with Synthetix
contract SynthetixAdapter is AdapterBase {
    address private immutable ORIGINATOR;
    address private immutable SYNTHETIX;
    address private immutable SYNTHETIX_PRICE_FEED;
    bytes32 private immutable TRACKING_CODE;

    constructor(
        address _integrationManager,
        address _synthetixPriceFeed,
        address _originator,
        address _synthetix,
        bytes32 _trackingCode
    ) public AdapterBase(_integrationManager) {
        ORIGINATOR = _originator;
        SYNTHETIX = _synthetix;
        SYNTHETIX_PRICE_FEED = _synthetixPriceFeed;
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
        require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForMethod: _selector invalid");

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

        address[] memory synths = new address[](2);
        synths[0] = outgoingAsset;
        synths[1] = incomingAsset;

        bytes32[] memory currencyKeys = SynthetixPriceFeed(SYNTHETIX_PRICE_FEED)
            .getCurrencyKeysForSynths(synths);

        ISynthetix(SYNTHETIX).exchangeOnBehalfWithTracking(
            _vaultProxy,
            currencyKeys[0],
            outgoingAssetAmount,
            currencyKeys[1],
            ORIGINATOR,
            TRACKING_CODE
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded call arguments
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

    /// @notice Gets the `ORIGINATOR` variable
    /// @return originator_ The `ORIGINATOR` variable value
    function getOriginator() external view returns (address originator_) {
        return ORIGINATOR;
    }

    /// @notice Gets the `SYNTHETIX` variable
    /// @return synthetix_ The `SYNTHETIX` variable value
    function getSynthetix() external view returns (address synthetix_) {
        return SYNTHETIX;
    }

    /// @notice Gets the `SYNTHETIX_PRICE_FEED` variable
    /// @return synthetixPriceFeed_ The `SYNTHETIX_PRICE_FEED` variable value
    function getSynthetixPriceFeed() external view returns (address synthetixPriceFeed_) {
        return SYNTHETIX_PRICE_FEED;
    }

    /// @notice Gets the `TRACKING_CODE` variable
    /// @return trackingCode_ The `TRACKING_CODE` variable value
    function getTrackingCode() external view returns (bytes32 trackingCode_) {
        return TRACKING_CODE;
    }
}

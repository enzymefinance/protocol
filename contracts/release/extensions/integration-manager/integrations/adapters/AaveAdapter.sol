// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/price-feeds/derivatives/feeds/AavePriceFeed.sol";
import "../utils/actions/AaveActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title AaveAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Aave Lending <https://aave.com/>
contract AaveAdapter is AdapterBase, AaveActionsMixin {
    address private immutable AAVE_PRICE_FEED;

    constructor(
        address _integrationManager,
        address _lendingPoolAddressProvider,
        address _aavePriceFeed
    ) public AdapterBase(_integrationManager) AaveActionsMixin(_lendingPoolAddressProvider) {
        AAVE_PRICE_FEED = _aavePriceFeed;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "AAVE";
    }

    /// @notice Lends an amount of a token to AAVE
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _encodedAssetTransferArgs
    ) external onlyIntegrationManager {
        (
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,

        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        __aaveLend(_vaultProxy, spendAssets[0], spendAssetAmounts[0]);
    }

    /// @notice Redeems an amount of aTokens from AAVE
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _encodedAssetTransferArgs
    ) external onlyIntegrationManager {
        (
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        __aaveRedeem(_vaultProxy, spendAssets[0], spendAssetAmounts[0], incomingAssets[0]);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(
        address,
        bytes4 _selector,
        bytes calldata _encodedCallArgs
    )
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
        if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_encodedCallArgs);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_encodedCallArgs);
        }

        revert("parseAssetsForMethod: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _encodedCallArgs)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (address aToken, uint256 amount) = __decodeCallArgs(_encodedCallArgs);

        // Prevent from invalid token/aToken combination
        address token = AavePriceFeed(AAVE_PRICE_FEED).getUnderlyingForDerivative(aToken);
        require(token != address(0), "__parseAssetsForLend: Unsupported aToken");

        spendAssets_ = new address[](1);
        spendAssets_[0] = token;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = aToken;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = amount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during redeem() calls
    function __parseAssetsForRedeem(bytes calldata _encodedCallArgs)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (address aToken, uint256 amount) = __decodeCallArgs(_encodedCallArgs);

        // Prevent from invalid token/aToken combination
        address token = AavePriceFeed(AAVE_PRICE_FEED).getUnderlyingForDerivative(aToken);
        require(token != address(0), "__parseAssetsForRedeem: Unsupported aToken");

        spendAssets_ = new address[](1);
        spendAssets_[0] = aToken;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = token;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = amount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (address aToken, uint256 amount)
    {
        return abi.decode(_encodedCallArgs, (address, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `AAVE_PRICE_FEED` variable
    /// @return aavePriceFeed_ The `AAVE_PRICE_FEED` variable value
    function getAavePriceFeed() external view returns (address aavePriceFeed_) {
        return AAVE_PRICE_FEED;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../infrastructure/price-feeds/derivatives/feeds/AavePriceFeed.sol";
import "../../../../interfaces/IAaveLendingPool.sol";
import "../../../../interfaces/IAaveLendingPoolAddressProvider.sol";
import "../utils/AdapterBase2.sol";

/// @title AaveAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Aave Lending <https://aave.com/>
/// @dev When lending and redeeming, a small `ROUNDING_BUFFER` is subtracted from the expected
/// `aToken` values. This is a workaround for problematic quirks in `aToken` balance rounding
/// (due to RayMath and rebasing logic), which sometimes leads to tx failures due to strict
/// validation in the IntegrationManager of the incoming and outgoing asset amounts used in the tx.
/// Due to this workaround, an `aToken` value <= the `ROUNDING_BUFFER` is not usable in this adapter,
/// which is fine because those values would not make sense (gas-wise) to lend or redeem.
contract AaveAdapter is AdapterBase2 {
    using SafeMath for uint256;

    uint256 private constant ROUNDING_BUFFER = 2;
    uint16 private constant REFERRAL_CODE = 158;

    address private immutable AAVE_PRICE_FEED;
    address private immutable LENDING_POOL_ADDRESS_PROVIDER;

    constructor(
        address _integrationManager,
        address _lendingPoolAddressProvider,
        address _aavePriceFeed
    ) public AdapterBase2(_integrationManager) {
        LENDING_POOL_ADDRESS_PROVIDER = _lendingPoolAddressProvider;
        AAVE_PRICE_FEED = _aavePriceFeed;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "AAVE";
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
        if (_selector == LEND_SELECTOR) {
            (address aToken, uint256 amount) = __decodeCallArgs(_encodedCallArgs);

            // Prevent from invalid token/aToken combination
            address token = AavePriceFeed(AAVE_PRICE_FEED).getUnderlyingForDerivative(aToken);
            require(token != address(0), "parseAssetsForMethod: Unsupported aToken");

            spendAssets_ = new address[](1);
            spendAssets_[0] = token;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = amount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = aToken;
            minIncomingAssetAmounts_ = new uint256[](1);
            // See file @dev tag explanation of `ROUNDING_BUFFER`
            minIncomingAssetAmounts_[0] = amount.sub(ROUNDING_BUFFER);
        } else if (_selector == REDEEM_SELECTOR) {
            (address aToken, uint256 amount) = __decodeCallArgs(_encodedCallArgs);

            // Prevent from invalid token/aToken combination
            address token = AavePriceFeed(AAVE_PRICE_FEED).getUnderlyingForDerivative(aToken);
            require(token != address(0), "parseAssetsForMethod: Unsupported aToken");

            spendAssets_ = new address[](1);
            spendAssets_[0] = aToken;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = amount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = token;
            minIncomingAssetAmounts_ = new uint256[](1);
            // See file @dev tag explanation of `ROUNDING_BUFFER`.
            // Since `ROUNDING_BUFFER` is subtracted from spendAssetAmounts_[0]
            // in redeem(), we must also subtract it from the min incoming amount.
            // The extra `1` added to the buffer is just extra cautious.
            minIncomingAssetAmounts_[0] = amount.sub(ROUNDING_BUFFER + 1);
        } else {
            revert("parseAssetsForMethod: _selector invalid");
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
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

        address lendingPoolAddress = IAaveLendingPoolAddressProvider(LENDING_POOL_ADDRESS_PROVIDER)
            .getLendingPool();

        __approveMaxAsNeeded(spendAssets[0], lendingPoolAddress, spendAssetAmounts[0]);

        IAaveLendingPool(lendingPoolAddress).deposit(
            spendAssets[0],
            spendAssetAmounts[0],
            _vaultProxy,
            REFERRAL_CODE
        );
    }

    /// @notice Redeems an amount of aTokens from AAVE
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionSpendAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        address lendingPoolAddress = IAaveLendingPoolAddressProvider(LENDING_POOL_ADDRESS_PROVIDER)
            .getLendingPool();

        // See file @dev tag explanation of `ROUNDING_BUFFER`.
        // The surplus amount of the spendAsset `aToken` is sent back to the _vaultProxy
        // via `postActionSpendAssetsTransferHandler` to ensure that the IntegrationManager
        // validation of spendAssetAmounts passes.
        uint256 actualSpendAmount = spendAssetAmounts[0].sub(ROUNDING_BUFFER);

        __approveMaxAsNeeded(spendAssets[0], lendingPoolAddress, actualSpendAmount);

        IAaveLendingPool(lendingPoolAddress).withdraw(
            incomingAssets[0],
            actualSpendAmount,
            _vaultProxy
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

    /// @notice Gets the `LENDING_POOL_ADDRESS_PROVIDER` variable
    /// @return lendingPoolAddressProvider_ The `LENDING_POOL_ADDRESS_PROVIDER` variable value
    function getLendingPoolAddressProvider()
        external
        view
        returns (address lendingPoolAddressProvider_)
    {
        return LENDING_POOL_ADDRESS_PROVIDER;
    }

    /// @notice Gets the `REFERRAL_CODE` variable
    /// @return referralCode_ The `REFERRAL_CODE` variable value
    function getReferralCode() external pure returns (uint16 referralCode_) {
        return REFERRAL_CODE;
    }
}

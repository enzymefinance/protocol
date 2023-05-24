// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/price-feeds/derivatives/feeds/IdlePriceFeed.sol";
import "../../../../../external-interfaces/IIdleTokenV4.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../utils/actions/IdleV4ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title IdleAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Idle Lending <https://idle.finance/>
/// @dev There are some idiosyncrasies of reward accrual and claiming in IdleTokens that
/// are handled by this adapter:
/// - Rewards accrue to the IdleToken holder, but the accrued
/// amount is passed to the recipient of a transfer.
/// - Claiming rewards cannot be done on behalf of a holder, but must be done directly.
/// - Claiming rewards occurs automatically upon redeeming, but there are situations when
/// it is difficult to know whether to expect incoming rewards (e.g., after a user mints
/// idleTokens and then redeems before any other user has interacted with the protocol,
/// then getGovTokensAmounts() will return 0 balances). Because of this difficulty -
/// and in keeping with how other adapters treat claimed rewards -
/// this adapter does not report claimed rewards as incomingAssets.
contract IdleAdapter is AdapterBase, IdleV4ActionsMixin {
    using AddressArrayLib for address[];

    address private immutable IDLE_PRICE_FEED;

    constructor(address _integrationManager, address _idlePriceFeed) public AdapterBase(_integrationManager) {
        IDLE_PRICE_FEED = _idlePriceFeed;
    }

    /// @notice Claims rewards for a given IdleToken
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function claimRewards(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
        postActionSpendAssetsTransferHandler(_vaultProxy, _assetData)
    {
        address idleToken = __decodeClaimRewardsCallArgs(_actionData);

        __idleV4ClaimRewards(idleToken);

        __pushFullAssetBalances(_vaultProxy, __idleV4GetRewardsTokens(idleToken));
    }

    /// @notice Lends an amount of a token for idleToken
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lend(address _vaultProxy, bytes calldata, bytes calldata _assetData)
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        // More efficient to parse all from _assetData
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts, address[] memory incomingAssets) =
            __decodeAssetData(_assetData);

        __idleV4Lend(incomingAssets[0], spendAssets[0], spendAssetAmounts[0]);
    }

    /// @notice Redeems an amount of idleToken for its underlying asset
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    /// @dev This will also pay out any due gov token rewards.
    /// We use the full IdleToken balance of the current contract rather than the user input
    /// for the corner case of a prior balance existing in the current contract, which would
    /// throw off the per-user avg price of the IdleToken used by Idle, and would leave the
    /// initial token balance in the current contract post-tx.
    function redeem(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (address idleToken,,) = __decodeRedeemCallArgs(_actionData);

        __idleV4Redeem(idleToken, ERC20(idleToken).balanceOf(address(this)));

        __pushFullAssetBalances(_vaultProxy, __idleV4GetRewardsTokens(idleToken));
    }

    /// @dev Helper to get the underlying for a given IdleToken
    function __getUnderlyingForIdleToken(address _idleToken) private view returns (address underlying_) {
        return IdlePriceFeed(IDLE_PRICE_FEED).getUnderlyingForDerivative(_idleToken);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address _vaultProxy, bytes4 _selector, bytes calldata _actionData)
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
        if (_selector == CLAIM_REWARDS_SELECTOR) {
            return __parseAssetsForClaimRewards(_vaultProxy, _actionData);
        } else if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewards() calls
    function __parseAssetsForClaimRewards(address _vaultProxy, bytes calldata _actionData)
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
        address idleToken = __decodeClaimRewardsCallArgs(_actionData);

        require(
            __getUnderlyingForIdleToken(idleToken) != address(0), "__parseAssetsForClaimRewards: Unsupported idleToken"
        );

        spendAssets_ = new address[](1);
        spendAssets_[0] = idleToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = ERC20(idleToken).balanceOf(_vaultProxy);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            new address[](0),
            new uint256[](0)
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _actionData)
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
        (address idleToken, uint256 outgoingUnderlyingAmount, uint256 minIncomingIdleTokenAmount) =
            __decodeLendCallArgs(_actionData);

        address underlying = __getUnderlyingForIdleToken(idleToken);
        require(underlying != address(0), "__parseAssetsForLend: Unsupported idleToken");

        spendAssets_ = new address[](1);
        spendAssets_[0] = underlying;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingUnderlyingAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = idleToken;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingIdleTokenAmount;

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
    function __parseAssetsForRedeem(bytes calldata _actionData)
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
        (address idleToken, uint256 outgoingIdleTokenAmount, uint256 minIncomingUnderlyingAmount) =
            __decodeRedeemCallArgs(_actionData);

        address underlying = __getUnderlyingForIdleToken(idleToken);
        require(underlying != address(0), "__parseAssetsForRedeem: Unsupported idleToken");

        spendAssets_ = new address[](1);
        spendAssets_[0] = idleToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingIdleTokenAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = underlying;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingUnderlyingAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    /// @dev Helper to decode callArgs for claiming rewards tokens
    function __decodeClaimRewardsCallArgs(bytes memory _actionData) private pure returns (address idleToken_) {
        return abi.decode(_actionData, (address));
    }

    /// @dev Helper to decode callArgs for lending
    function __decodeLendCallArgs(bytes memory _actionData)
        private
        pure
        returns (address idleToken_, uint256 outgoingUnderlyingAmount_, uint256 minIncomingIdleTokenAmount_)
    {
        return abi.decode(_actionData, (address, uint256, uint256));
    }

    /// @dev Helper to decode callArgs for redeeming
    function __decodeRedeemCallArgs(bytes memory _actionData)
        private
        pure
        returns (address idleToken_, uint256 outgoingIdleTokenAmount_, uint256 minIncomingUnderlyingAmount_)
    {
        return abi.decode(_actionData, (address, uint256, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `IDLE_PRICE_FEED` variable
    /// @return idlePriceFeed_ The `IDLE_PRICE_FEED` variable value
    function getIdlePriceFeed() external view returns (address idlePriceFeed_) {
        return IDLE_PRICE_FEED;
    }
}

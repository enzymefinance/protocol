// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/price-feeds/derivatives/feeds/IdlePriceFeed.sol";
import "../../../../interfaces/IIdleTokenV4.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../utils/actions/IdleV4ActionsMixin.sol";
import "../utils/actions/UniswapV2ActionsMixin.sol";
import "../utils/AdapterBase2.sol";

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
contract IdleAdapter is AdapterBase2, IdleV4ActionsMixin, UniswapV2ActionsMixin {
    using AddressArrayLib for address[];

    address private immutable IDLE_PRICE_FEED;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _idlePriceFeed,
        address _wethToken,
        address _uniswapV2Router2
    ) public AdapterBase2(_integrationManager) UniswapV2ActionsMixin(_uniswapV2Router2) {
        IDLE_PRICE_FEED = _idlePriceFeed;
        WETH_TOKEN = _wethToken;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "IDLE";
    }

    /// @notice Approves assets from the vault to be used by this contract.
    /// @dev No logic necessary. Exists only to grant adapter with necessary approvals from the vault,
    /// which takes place in the IntegrationManager.
    function approveAssets(
        address,
        bytes calldata,
        bytes calldata
    ) external {}

    /// @notice Claims rewards for a givenIdleToken
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function claimRewards(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionSpendAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (, address idleToken) = __decodeClaimRewardsCallArgs(_encodedCallArgs);

        __idleV4ClaimRewards(idleToken);

        __pushFullAssetBalances(_vaultProxy, __idleV4GetRewardsTokens(idleToken));
    }

    /// @notice Claims rewards and then compounds the rewards tokens back into the idleToken
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    /// @dev The `useFullBalances` option indicates whether to use only the newly claimed balances of
    /// rewards tokens, or whether to use the full balances of these assets in the vault.
    /// If full asset balances are to be used, then this requires the adapter to be granted
    /// an allowance of each reward token by the vault.
    /// For supported assets (e.g., COMP), this must be done via the `approveAssets()` function in this adapter.
    /// For unsupported assets (e.g., IDLE), this must be done via `ComptrollerProxy.vaultCallOnContract()`, if allowed.
    function claimRewardsAndReinvest(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        // The idleToken is both the spend asset and the incoming asset in this case
        postActionSpendAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (, address idleToken, , bool useFullBalances) = __decodeClaimRewardsAndReinvestCallArgs(
            _encodedCallArgs
        );

        address underlying = __getUnderlyingForIdleToken(idleToken);
        require(underlying != address(0), "claimRewardsAndReinvest: Unsupported idleToken");

        (
            address[] memory rewardsTokens,
            uint256[] memory rewardsTokenAmountsToUse
        ) = __claimRewardsAndPullRewardsTokens(_vaultProxy, idleToken, useFullBalances);

        // Swap all reward tokens to the idleToken's underlying via UniswapV2,
        // using WETH as the intermediary where necessary
        __uniswapV2SwapManyToOne(
            address(this),
            rewardsTokens,
            rewardsTokenAmountsToUse,
            underlying,
            WETH_TOKEN
        );

        // Lend all received underlying asset for the idleToken
        uint256 underlyingBalance = ERC20(underlying).balanceOf(address(this));
        if (underlyingBalance > 0) {
            __idleV4Lend(idleToken, underlying, underlyingBalance);
        }
    }

    /// @notice Claims rewards and then swaps the rewards tokens to the specified asset via UniswapV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    /// @dev The `useFullBalances` option indicates whether to use only the newly claimed balances of
    /// rewards tokens, or whether to use the full balances of these assets in the vault.
    /// If full asset balances are to be used, then this requires the adapter to be granted
    /// an allowance of each reward token by the vault.
    /// For supported assets (e.g., COMP), this must be done via the `approveAssets()` function in this adapter.
    /// For unsupported assets (e.g., IDLE), this must be done via `ComptrollerProxy.vaultCallOnContract()`, if allowed.
    function claimRewardsAndSwap(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionSpendAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            ,
            address idleToken,
            address incomingAsset,
            ,
            bool useFullBalances
        ) = __decodeClaimRewardsAndSwapCallArgs(_encodedCallArgs);

        (
            address[] memory rewardsTokens,
            uint256[] memory rewardsTokenAmountsToUse
        ) = __claimRewardsAndPullRewardsTokens(_vaultProxy, idleToken, useFullBalances);

        // Swap all reward tokens to the designated incomingAsset via UniswapV2,
        // using WETH as the intermediary where necessary
        __uniswapV2SwapManyToOne(
            _vaultProxy,
            rewardsTokens,
            rewardsTokenAmountsToUse,
            incomingAsset,
            WETH_TOKEN
        );
    }

    /// @notice Lends an amount of a token for idleToken
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        // More efficient to parse all from _encodedAssetTransferArgs
        (
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        __idleV4Lend(incomingAssets[0], spendAssets[0], spendAssetAmounts[0]);
    }

    /// @notice Redeems an amount of idleToken for its underlying asset
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    /// @dev This will also pay out any due gov token rewards.
    /// We use the full IdleToken balance of the current contract rather than the user input
    /// for the corner case of a prior balance existing in the current contract, which would
    /// throw off the per-user avg price of the IdleToken used by Idle, and would leave the
    /// initial token balance in the current contract post-tx.
    function redeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (address idleToken, , ) = __decodeRedeemCallArgs(_encodedCallArgs);

        __idleV4Redeem(idleToken, ERC20(idleToken).balanceOf(address(this)));

        __pushFullAssetBalances(_vaultProxy, __idleV4GetRewardsTokens(idleToken));
    }

    /// @dev Helper to claim rewards and pull rewards tokens from the vault
    /// to the current contract, as needed
    function __claimRewardsAndPullRewardsTokens(
        address _vaultProxy,
        address _idleToken,
        bool _useFullBalances
    )
        private
        returns (address[] memory rewardsTokens_, uint256[] memory rewardsTokenAmountsToUse_)
    {
        __idleV4ClaimRewards(_idleToken);

        rewardsTokens_ = __idleV4GetRewardsTokens(_idleToken);
        if (_useFullBalances) {
            __pullFullAssetBalances(_vaultProxy, rewardsTokens_);
        }

        return (rewardsTokens_, __getAssetBalances(address(this), rewardsTokens_));
    }

    /// @dev Helper to get the underlying for a given IdleToken
    function __getUnderlyingForIdleToken(address _idleToken)
        private
        view
        returns (address underlying_)
    {
        return IdlePriceFeed(IDLE_PRICE_FEED).getUnderlyingForDerivative(_idleToken);
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
        if (_selector == APPROVE_ASSETS_SELECTOR) {
            return __parseAssetsForApproveAssets(_encodedCallArgs);
        } else if (_selector == CLAIM_REWARDS_SELECTOR) {
            return __parseAssetsForClaimRewards(_encodedCallArgs);
        } else if (_selector == CLAIM_REWARDS_AND_REINVEST_SELECTOR) {
            return __parseAssetsForClaimRewardsAndReinvest(_encodedCallArgs);
        } else if (_selector == CLAIM_REWARDS_AND_SWAP_SELECTOR) {
            return __parseAssetsForClaimRewardsAndSwap(_encodedCallArgs);
        } else if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_encodedCallArgs);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_encodedCallArgs);
        }

        revert("parseAssetsForMethod: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during approveAssets() calls
    function __parseAssetsForApproveAssets(bytes calldata _encodedCallArgs)
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
        address idleToken;
        (idleToken, spendAssets_, spendAssetAmounts_) = __decodeApproveAssetsCallArgs(
            _encodedCallArgs
        );
        require(
            __getUnderlyingForIdleToken(idleToken) != address(0),
            "__parseAssetsForApproveAssets: Unsupported idleToken"
        );
        require(
            spendAssets_.length == spendAssetAmounts_.length,
            "__parseAssetsForApproveAssets: Unequal arrays"
        );

        // Validate that only rewards tokens are given allowances
        address[] memory rewardsTokens = __idleV4GetRewardsTokens(idleToken);
        for (uint256 i; i < spendAssets_.length; i++) {
            // Allow revoking approval for any asset
            if (spendAssetAmounts_[i] > 0) {
                require(
                    rewardsTokens.contains(spendAssets_[i]),
                    "__parseAssetsForApproveAssets: Invalid reward token"
                );
            }
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            new address[](0),
            new uint256[](0)
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewards() calls
    function __parseAssetsForClaimRewards(bytes calldata _encodedCallArgs)
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
        (address vaultProxy, address idleToken) = __decodeClaimRewardsCallArgs(_encodedCallArgs);

        require(
            __getUnderlyingForIdleToken(idleToken) != address(0),
            "__parseAssetsForClaimRewards: Unsupported idleToken"
        );

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForClaimRewardsCalls(
            vaultProxy,
            idleToken
        );

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            new address[](0),
            new uint256[](0)
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewardsAndReinvest() calls.
    function __parseAssetsForClaimRewardsAndReinvest(bytes calldata _encodedCallArgs)
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
        (
            address vaultProxy,
            address idleToken,
            uint256 minIncomingIdleTokenAmount,

        ) = __decodeClaimRewardsAndReinvestCallArgs(_encodedCallArgs);

        // Does not validate idleToken here as we need to do fetch the underlying during the action

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForClaimRewardsCalls(
            vaultProxy,
            idleToken
        );

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
    /// during claimRewardsAndSwap() calls.
    function __parseAssetsForClaimRewardsAndSwap(bytes calldata _encodedCallArgs)
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
        (
            address vaultProxy,
            address idleToken,
            address incomingAsset,
            uint256 minIncomingAssetAmount,

        ) = __decodeClaimRewardsAndSwapCallArgs(_encodedCallArgs);

        require(
            __getUnderlyingForIdleToken(idleToken) != address(0),
            "__parseAssetsForClaimRewardsAndSwap: Unsupported idleToken"
        );

        (spendAssets_, spendAssetAmounts_) = __parseSpendAssetsForClaimRewardsCalls(
            vaultProxy,
            idleToken
        );

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingAsset;

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
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
        (
            address idleToken,
            uint256 outgoingUnderlyingAmount,
            uint256 minIncomingIdleTokenAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

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
        (
            address idleToken,
            uint256 outgoingIdleTokenAmount,
            uint256 minIncomingUnderlyingAmount
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

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

    /// @dev Helper function to parse spend assets for calls to claim rewards
    function __parseSpendAssetsForClaimRewardsCalls(address _vaultProxy, address _idleToken)
        private
        view
        returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_)
    {
        spendAssets_ = new address[](1);
        spendAssets_[0] = _idleToken;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = ERC20(_idleToken).balanceOf(_vaultProxy);

        return (spendAssets_, spendAssetAmounts_);
    }

    ///////////////////////
    // ENCODED CALL ARGS //
    ///////////////////////

    /// @dev Helper to decode the encoded call arguments for approving asset allowances
    function __decodeApproveAssetsCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address idleToken_,
            address[] memory assets_,
            uint256[] memory amounts_
        )
    {
        return abi.decode(_encodedCallArgs, (address, address[], uint256[]));
    }

    /// @dev Helper to decode callArgs for claiming rewards tokens
    function __decodeClaimRewardsCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (address vaultProxy_, address idleToken_)
    {
        return abi.decode(_encodedCallArgs, (address, address));
    }

    /// @dev Helper to decode the encoded call arguments for claiming rewards and reinvesting
    function __decodeClaimRewardsAndReinvestCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address vaultProxy_,
            address idleToken_,
            uint256 minIncomingIdleTokenAmount_,
            bool useFullBalances_
        )
    {
        return abi.decode(_encodedCallArgs, (address, address, uint256, bool));
    }

    /// @dev Helper to decode the encoded call arguments for claiming rewards and swapping
    function __decodeClaimRewardsAndSwapCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address vaultProxy_,
            address idleToken_,
            address incomingAsset_,
            uint256 minIncomingAssetAmount_,
            bool useFullBalances_
        )
    {
        return abi.decode(_encodedCallArgs, (address, address, address, uint256, bool));
    }

    /// @dev Helper to decode callArgs for lending
    function __decodeLendCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address idleToken_,
            uint256 outgoingUnderlyingAmount_,
            uint256 minIncomingIdleTokenAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, uint256, uint256));
    }

    /// @dev Helper to decode callArgs for redeeming
    function __decodeRedeemCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address idleToken_,
            uint256 outgoingIdleTokenAmount_,
            uint256 minIncomingUnderlyingAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, uint256, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `IDLE_PRICE_FEED` variable
    /// @return idlePriceFeed_ The `IDLE_PRICE_FEED` variable value
    function getIdlePriceFeed() external view returns (address idlePriceFeed_) {
        return IDLE_PRICE_FEED;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}

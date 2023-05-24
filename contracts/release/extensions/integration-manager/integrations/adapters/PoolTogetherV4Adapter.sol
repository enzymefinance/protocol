// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/price-feeds/derivatives/feeds/PoolTogetherV4PriceFeed.sol";
import "../utils/actions/PoolTogetherV4ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title PoolTogetherV4Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for PoolTogether (v4)
contract PoolTogetherV4Adapter is AdapterBase, PoolTogetherV4ActionsMixin {
    address private immutable POOL_TOGETHER_V4_PRICE_FEED;

    constructor(address _integrationManager, address _poolTogetherV4PriceFeed)
        public
        AdapterBase(_integrationManager)
    {
        POOL_TOGETHER_V4_PRICE_FEED = _poolTogetherV4PriceFeed;
    }

    /// @notice Claims rewards from the Prize Distributor
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function claimRewards(address _vaultProxy, bytes calldata _actionData, bytes calldata)
        external
        onlyIntegrationManager
    {
        (address prizeDistributor, uint32[] memory drawIds, bytes memory winningPicks) =
            __decodeClaimRewardsCallArgs(_actionData);

        __poolTogetherV4Claim(_vaultProxy, prizeDistributor, drawIds, winningPicks);
    }

    /// @notice Lends an amount of a token to PoolTogether
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(address _vaultProxy, bytes calldata, bytes calldata _encodedAssetTransferArgs)
        external
        onlyIntegrationManager
    {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts, address[] memory incomingAssets) =
            __decodeAssetData(_encodedAssetTransferArgs);

        __poolTogetherV4Lend(_vaultProxy, spendAssets[0], spendAssetAmounts[0], incomingAssets[0]);
    }

    /// @notice Redeems an amount of ptTokens from PoolTogether
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(address _vaultProxy, bytes calldata, bytes calldata _encodedAssetTransferArgs)
        external
        onlyIntegrationManager
    {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts,) =
            __decodeAssetData(_encodedAssetTransferArgs);

        __poolTogetherV4Redeem(_vaultProxy, spendAssets[0], spendAssetAmounts[0]);
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
    function parseAssetsForAction(address, bytes4 _selector, bytes calldata _actionData)
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
            return __parseAssetsForClaimRewards();
        } else if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
        }

        revert("parseAssetsForMethod: _selector invalid");
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
        (address ptToken, uint256 amount) = __decodeCallArgs(_actionData);

        // Prevent from invalid token/ptToken combination
        address token = PoolTogetherV4PriceFeed(POOL_TOGETHER_V4_PRICE_FEED).getUnderlyingForDerivative(ptToken);
        require(token != address(0), "__parseAssetsForLend: Unsupported ptToken");

        spendAssets_ = new address[](1);
        spendAssets_[0] = token;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = ptToken;
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
        (address ptToken, uint256 amount) = __decodeCallArgs(_actionData);

        // Prevent from invalid token/ptToken combination
        address token = PoolTogetherV4PriceFeed(POOL_TOGETHER_V4_PRICE_FEED).getUnderlyingForDerivative(ptToken);
        require(token != address(0), "__parseAssetsForRedeem: Unsupported ptToken");

        spendAssets_ = new address[](1);
        spendAssets_[0] = ptToken;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = token;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = amount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Approve,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewards() calls
    function __parseAssetsForClaimRewards()
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        return (
            IIntegrationManager.SpendAssetsHandleType.None,
            new address[](0),
            new uint256[](0),
            new address[](0),
            new uint256[](0)
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCallArgs(bytes memory _actionData) private pure returns (address ptToken_, uint256 amount_) {
        return abi.decode(_actionData, (address, uint256));
    }

    /// @dev Helper to decode callArgs for claiming rewards tokens
    function __decodeClaimRewardsCallArgs(bytes memory _actionData)
        private
        pure
        returns (address prizeDistributor_, uint32[] memory drawIds_, bytes memory winningPicks_)
    {
        return abi.decode(_actionData, (address, uint32[], bytes));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `POOL_TOGETHER_V4_PRICE_FEED` variable
    /// @return poolTogetherV4PriceFeed_ The `POOL_TOGETHER_V4_PRICE_FEED` variable value
    function getPoolTogetherV4PriceFeed() external view returns (address poolTogetherV4PriceFeed_) {
        return POOL_TOGETHER_V4_PRICE_FEED;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../utils/actions/AlphaHomoraV1ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title AlphaHomoraV1Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Alpha Homora v1 <https://alphafinance.io/>
contract AlphaHomoraV1Adapter is AdapterBase, AlphaHomoraV1ActionsMixin {
    constructor(
        address _integrationManager,
        address _ibethToken,
        address _wethToken
    ) public AdapterBase(_integrationManager) AlphaHomoraV1ActionsMixin(_ibethToken, _wethToken) {}

    /// @dev Needed to receive ETH during redemption
    receive() external payable {}

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "ALPHA_HOMORA_V1";
    }

    /// @notice Lends WETH for ibETH
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (uint256 wethAmount, ) = __decodeCallArgs(_encodedCallArgs);

        __alphaHomoraV1Lend(wethAmount);
    }

    /// @notice Redeems ibETH for WETH
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        postActionIncomingAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (uint256 ibethAmount, ) = __decodeCallArgs(_encodedCallArgs);

        __alphaHomoraV1Redeem(ibethAmount);
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
        (uint256 wethAmount, uint256 minIbethAmount) = __decodeCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getAlphaHomoraV1WethToken();
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = wethAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getAlphaHomoraV1IbethToken();
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIbethAmount;

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
        (uint256 ibethAmount, uint256 minWethAmount) = __decodeCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getAlphaHomoraV1IbethToken();
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = ibethAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getAlphaHomoraV1WethToken();
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minWethAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded call arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (uint256 outgoingAmount_, uint256 minIncomingAmount_)
    {
        return abi.decode(_encodedCallArgs, (uint256, uint256));
    }
}

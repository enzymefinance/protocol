// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../infrastructure/price-feeds/derivatives/feeds/CompoundPriceFeed.sol";
import "../../../../interfaces/ICERC20.sol";
import "../../../../interfaces/ICEther.sol";
import "../../../../interfaces/IWETH.sol";
import "../utils/AdapterBase.sol";

/// @title CompoundAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Compound <https://compound.finance/>
contract CompoundAdapter is AdapterBase {
    address private immutable COMPOUND_PRICE_FEED;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _compoundPriceFeed,
        address _wethToken
    ) public AdapterBase(_integrationManager) {
        COMPOUND_PRICE_FEED = _compoundPriceFeed;
        WETH_TOKEN = _wethToken;
    }

    /// @dev Needed to receive ETH during cEther lend/redeem
    receive() external payable {}

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "COMPOUND";
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
            (address cToken, uint256 tokenAmount, uint256 minCTokenAmount) = __decodeCallArgs(
                _encodedCallArgs
            );
            address token = CompoundPriceFeed(COMPOUND_PRICE_FEED).getTokenFromCToken(cToken);
            require(token != address(0), "parseAssetsForMethod: Unsupported cToken");

            spendAssets_ = new address[](1);
            spendAssets_[0] = token;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = tokenAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = cToken;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minCTokenAmount;
        } else if (_selector == REDEEM_SELECTOR) {
            (address cToken, uint256 cTokenAmount, uint256 minTokenAmount) = __decodeCallArgs(
                _encodedCallArgs
            );
            address token = CompoundPriceFeed(COMPOUND_PRICE_FEED).getTokenFromCToken(cToken);
            require(token != address(0), "parseAssetsForMethod: Unsupported cToken");

            spendAssets_ = new address[](1);
            spendAssets_[0] = cToken;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = cTokenAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = token;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minTokenAmount;
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

    /// @notice Lends an amount of a token to Compound
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        // More efficient to parse all from _encodedAssetTransferArgs
        (
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        if (spendAssets[0] == WETH_TOKEN) {
            IWETH(WETH_TOKEN).withdraw(spendAssetAmounts[0]);
            ICEther(incomingAssets[0]).mint{value: spendAssetAmounts[0]}();
        } else {
            __approveMaxAsNeeded(spendAssets[0], incomingAssets[0], spendAssetAmounts[0]);
            ICERC20(incomingAssets[0]).mint(spendAssetAmounts[0]);
        }
    }

    /// @notice Redeems an amount of cTokens from Compound
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        // More efficient to parse all from _encodedAssetTransferArgs
        (
            ,
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets
        ) = __decodeEncodedAssetTransferArgs(_encodedAssetTransferArgs);

        ICERC20(spendAssets[0]).redeem(spendAssetAmounts[0]);

        if (incomingAssets[0] == WETH_TOKEN) {
            IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address cToken_,
            uint256 outgoingAssetAmount_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, uint256, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `COMPOUND_PRICE_FEED` variable
    /// @return compoundPriceFeed_ The `COMPOUND_PRICE_FEED` variable value
    function getCompoundPriceFeed() external view returns (address compoundPriceFeed_) {
        return COMPOUND_PRICE_FEED;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}

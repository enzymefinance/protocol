// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/ICERC20.sol";
import "../../../../interfaces/ICEther.sol";
import "../../../../interfaces/IWETH.sol";
import "../utils/AdapterBase.sol";

/// @title CompoundAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for Compound <https://compound.finance/>
contract CompoundAdapter is AdapterBase {
    address private immutable WETH_TOKEN;

    constructor(address _integrationManager, address _wethToken)
        public
        AdapterBase(_integrationManager)
    {
        WETH_TOKEN = _wethToken;
    }

    /// @dev Needed to receive ETH from swap
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
        if (_selector == LEND_SELECTOR || _selector == REDEEM_SELECTOR) {
            (
                address _outgoingAsset,
                uint256 _outgoingAssetAmount,
                address _incomingAsset,
                uint256 _minIncomingAssetAmount
            ) = __decodeCallArgs(_encodedCallArgs);

            spendAssetsHandleType_ = IIntegrationManager.SpendAssetsHandleType.Transfer;

            spendAssets_ = new address[](1);
            spendAssets_[0] = _outgoingAsset;

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = _outgoingAssetAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = _incomingAsset;

            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = _minIncomingAssetAmount;
        } else {
            revert("parseIncomingAssets: _selector invalid");
        }

        return (
            spendAssetsHandleType_,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Lends an asset to Compound
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
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (address token, uint256 tokenAmount, address cToken, ) = __decodeCallArgs(
            _encodedCallArgs
        );
        if (token == WETH_TOKEN) {
            IWETH(WETH_TOKEN).withdraw(tokenAmount);
            ICEther(cToken).mint{value: tokenAmount}();
        } else {
            __approveMaxAsNeeded(token, cToken, tokenAmount);
            ICERC20(cToken).mint(tokenAmount);
        }
    }

    /// @notice Redeems an asset from Compound
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
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (address cToken, uint256 cTokenAmount, address token, ) = __decodeCallArgs(
            _encodedCallArgs
        );
        ICERC20(cToken).redeem(cTokenAmount);
        if (token == WETH_TOKEN) {
            IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address outgoingAsset_,
            uint256 outgoingAssetAmount,
            address incomingAsset_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, uint256, address, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}

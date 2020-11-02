// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../interfaces/IChai.sol";
import "../utils/AdapterBase.sol";

/// @title ChaiAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for Chai <https://github.com/dapphub/chai>
contract ChaiAdapter is AdapterBase {
    address private immutable CHAI;
    address private immutable DAI;

    constructor(
        address _integrationManager,
        address _chai,
        address _dai
    ) public AdapterBase(_integrationManager) {
        CHAI = _chai;
        DAI = _dai;
    }

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "CHAI";
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
            (uint256 daiAmount, uint256 minChaiAmount) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = DAI;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = daiAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = CHAI;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minChaiAmount;
        } else if (_selector == REDEEM_SELECTOR) {
            (uint256 chaiAmount, uint256 minDaiAmount) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = CHAI;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = chaiAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = DAI;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minDaiAmount;
        } else {
            revert("parseIncomingAssets: _selector invalid");
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Lend Dai for Chai
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
        (uint256 daiAmount, ) = __decodeCallArgs(_encodedCallArgs);

        __approveMaxAsNeeded(DAI, CHAI, daiAmount);

        // Execute Lend on Chai
        // Chai.join allows specifying the vaultProxy as the destination of Chai tokens
        IChai(CHAI).join(_vaultProxy, daiAmount);
    }

    /// @notice Redeem Chai for Dai
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
        (uint256 chaiAmount, ) = __decodeCallArgs(_encodedCallArgs);

        // Execute redeem on Chai
        // Chai.exit sends Dai back to the adapter
        IChai(CHAI).exit(address(this), chaiAmount);
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

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CHAI` variable value
    /// @return chai_ The `CHAI` variable value
    function getChai() external view returns (address chai_) {
        return CHAI;
    }

    /// @notice Gets the `DAI` variable value
    /// @return dai_ The `DAI` variable value
    function getDai() external view returns (address dai_) {
        return DAI;
    }
}

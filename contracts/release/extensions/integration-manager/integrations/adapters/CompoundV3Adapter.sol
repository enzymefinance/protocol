// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/token/ERC20/IERC20.sol";
import
    "../../../../../persistent/address-list-registry/address-list-owners/utils/AddOnlyAddressListOwnerConsumerMixin.sol";
import "../../../../../external-interfaces/ICompoundV3Configurator.sol";
import "../utils/0.6.12/actions/CompoundV3ActionsMixin.sol";
import "../utils/0.6.12/AdapterBase.sol";

/// @title CompoundV3Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for Compound v3 Lending <https://compound.finance/>
/// @dev When lending and redeeming, a small `ROUNDING_BUFFER` is subtracted from the min incoming asset amount.
/// This is a workaround for problematic quirks in `cTokenV3` balance rounding (due to rebasing logic),
/// which would otherwise lead to tx failures during IntegrationManager validation of incoming asset amounts.
/// Due to this workaround, a `cTokenV3` value less than `ROUNDING_BUFFER` is not usable in this adapter,
/// which is fine because those values would not make sense (gas-wise) to lend or redeem.
contract CompoundV3Adapter is AdapterBase, AddOnlyAddressListOwnerConsumerMixin, CompoundV3ActionsMixin {
    uint256 internal constant ROUNDING_BUFFER = 2;

    ICompoundV3Configurator private immutable CONFIGURATOR_CONTRACT;

    constructor(
        address _integrationManager,
        address _compoundV3Configurator,
        address _compoundV3Rewards,
        address _addressListRegistry,
        uint256 _cTokenListId
    )
        public
        AdapterBase(_integrationManager)
        AddOnlyAddressListOwnerConsumerMixin(_addressListRegistry, _cTokenListId)
        CompoundV3ActionsMixin(_compoundV3Rewards)
    {
        CONFIGURATOR_CONTRACT = ICompoundV3Configurator(_compoundV3Configurator);
    }

    /// @notice Claims rewards from Compound's V3 Rewards
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function claimRewards(address _vaultProxy, bytes calldata _actionData, bytes calldata) external {
        address[] memory cTokens = __decodeClaimArgs(_actionData);

        for (uint256 i; i < cTokens.length; i++) {
            __compoundV3ClaimRewards({_cToken: cTokens[i], _src: _vaultProxy});
        }
    }

    /// @notice Lends an amount of a token to Compound
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lend(address _vaultProxy, bytes calldata, bytes calldata _assetData) external {
        // More efficient to parse all from _assetData
        (address[] memory spendAssets,, address[] memory incomingAssets) = __decodeAssetData(_assetData);

        // Validate cToken.
        // Must be done here instead of parseAssetsForAction(),
        // since overriding visibility is not allowed.
        __validateAndAddListItemIfUnregistered(incomingAssets[0]);

        __compoundV3Lend({
            _underlying: spendAssets[0],
            _cToken: incomingAssets[0],
            _recipient: _vaultProxy,
            _amount: IERC20(spendAssets[0]).balanceOf(address(this))
        });
    }

    /// @notice Redeems an amount of cTokens from Compound
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function redeem(address _vaultProxy, bytes calldata, bytes calldata _assetData) external {
        // More efficient to parse all from _assetData
        (address[] memory spendAssets,, address[] memory incomingAssets) = __decodeAssetData(_assetData);

        // Validate cToken.
        // Must be done here instead of parseAssetsForAction(),
        // since overriding visibility is not allowed.
        __validateAndAddListItemIfUnregistered(spendAssets[0]);

        __compoundV3Redeem({
            _cToken: spendAssets[0],
            _underlying: incomingAssets[0],
            _recipient: _vaultProxy,
            _amount: IERC20(spendAssets[0]).balanceOf(address(this))
        });
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _vaultProxy The VaultProxy of the fund
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
            return __parseAssetsForClaimRewards();
        } else if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem({_vaultProxy: _vaultProxy, _actionData: _actionData});
        } else {
            revert("parseAssetsForAction: _selector invalid");
        }
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during claimRewards() calls.
    /// No action required, all values empty.
    function __parseAssetsForClaimRewards()
        internal
        pure
        virtual
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
        (address cToken, uint256 underlyingAmount) = __decodeLendOrRedeemArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = CONFIGURATOR_CONTRACT.getConfiguration(cToken).baseToken;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = underlyingAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = cToken;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = underlyingAmount.sub(ROUNDING_BUFFER);

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
    function __parseAssetsForRedeem(address _vaultProxy, bytes calldata _actionData)
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
        (address cToken, uint256 amount) = __decodeLendOrRedeemArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = cToken;
        spendAssetAmounts_ = new uint256[](1);

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = CONFIGURATOR_CONTRACT.getConfiguration(cToken).baseToken;
        minIncomingAssetAmounts_ = new uint256[](1);

        if (amount == type(uint256).max) {
            amount = IERC20(cToken).balanceOf(_vaultProxy);
        }

        spendAssetAmounts_[0] = amount;
        minIncomingAssetAmounts_[0] = amount.sub(ROUNDING_BUFFER);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode actionData for claimRewards
    function __decodeClaimArgs(bytes memory _actionData) private pure returns (address[] memory cTokens_) {
        return abi.decode(_actionData, (address[]));
    }

    /// @dev Helper to decode actionData for lend and redeem
    function __decodeLendOrRedeemArgs(bytes memory _actionData)
        private
        pure
        returns (address cToken_, uint256 outgoingAssetAmount_)
    {
        return abi.decode(_actionData, (address, uint256));
    }
}

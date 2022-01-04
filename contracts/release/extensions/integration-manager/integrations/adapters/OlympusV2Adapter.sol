// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../utils/actions/OlympusV2ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title OlympusV2Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for OlympusV2 Staking
contract OlympusV2Adapter is AdapterBase, OlympusV2ActionMixin {
    address private immutable OHM_TOKEN;
    address private immutable SOHM_TOKEN;

    constructor(
        address _integrationManager,
        address _ohmToken,
        address _sohmToken,
        address _stakingContract
    ) public AdapterBase(_integrationManager) OlympusV2ActionMixin(_stakingContract) {
        OHM_TOKEN = _ohmToken;
        SOHM_TOKEN = _sohmToken;

        ERC20(_ohmToken).safeApprove(_stakingContract, type(uint256).max);
        ERC20(_sohmToken).safeApprove(_stakingContract, type(uint256).max);
    }

    /// @notice Stakes an amount of OHM to OlympusV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function stake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        uint256 amount = __decodeCallArgs(_actionData);

        __olympusV2Stake(_vaultProxy, amount);
    }

    /// @notice Unstakes an amount of sOHM from OlympusV2
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    function unstake(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        uint256 amount = __decodeCallArgs(_actionData);

        if (amount == type(uint256).max) {
            amount = ERC20(getSohmToken()).balanceOf(address(this));
        }

        __olympusV2Unstake(_vaultProxy, amount);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(
        address _vaultProxy,
        bytes4 _selector,
        bytes calldata _actionData
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
        if (_selector == STAKE_SELECTOR) {
            return __parseAssetsForStake(_actionData);
        } else if (_selector == UNSTAKE_SELECTOR) {
            return __parseAssetsForUnstake(_vaultProxy, _actionData);
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during stake() calls
    function __parseAssetsForStake(bytes calldata _actionData)
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
        uint256 amount = __decodeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getOhmToken();
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getSohmToken();
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
    /// during unstake() calls
    function __parseAssetsForUnstake(address _vaultProxy, bytes calldata _actionData)
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
        uint256 amount = __decodeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = getSohmToken();
        spendAssetAmounts_ = new uint256[](1);

        if (amount == type(uint256).max) {
            spendAssetAmounts_[0] = ERC20(getSohmToken()).balanceOf(_vaultProxy);
        } else {
            spendAssetAmounts_[0] = amount;
        }

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = getOhmToken();
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = spendAssetAmounts_[0];

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for stake and unstake
    function __decodeCallArgs(bytes memory _actionData) private pure returns (uint256 amount_) {
        return abi.decode(_actionData, (uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `OHM_TOKEN` variable
    /// @return ohmToken_ The `OHM_TOKEN` variable value
    function getOhmToken() public view returns (address ohmToken_) {
        return OHM_TOKEN;
    }

    /// @notice Gets the `SOHM_TOKEN` variable
    /// @return sohmToken_ The `SOHM_TOKEN` variable value
    function getSohmToken() public view returns (address sohmToken_) {
        return SOHM_TOKEN;
    }
}

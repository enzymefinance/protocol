// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../IPolicy.sol";

/// @title PolicyBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract base contract for all policies
abstract contract PolicyBase is IPolicy {
    address internal immutable POLICY_MANAGER;

    modifier onlyPolicyManager() {
        require(msg.sender == POLICY_MANAGER, "Only the PolicyManager can make this call");
        _;
    }

    constructor(address _policyManager) public {
        POLICY_MANAGER = _policyManager;
    }

    /// @notice Validates and initializes a policy as necessary prior to fund activation
    /// @dev Unimplemented by default, can be overridden by the policy
    function activateForFund(address) external virtual override {
        return;
    }

    /// @notice Whether or not the policy can be disabled
    /// @return canDisable_ True if the policy can be disabled
    /// @dev False by default, can be overridden by the policy
    function canDisable() external pure virtual override returns (bool canDisable_) {
        return false;
    }

    /// @notice Updates the policy settings for a fund
    /// @dev Disallowed by default, can be overridden by the policy
    function updateFundSettings(address, bytes calldata) external virtual override {
        revert("updateFundSettings: Updates not allowed for this policy");
    }

    //////////////////////////////
    // VALIDATION DATA DECODING //
    //////////////////////////////

    /// @dev Helper to parse validation arguments from encoded data for AddTrackedAssets policy hook
    function __decodeAddTrackedAssetsValidationData(bytes memory _validationData)
        internal
        pure
        returns (address caller_, address[] memory assets_)
    {
        return abi.decode(_validationData, (address, address[]));
    }

    /// @dev Helper to parse validation arguments from encoded data for CreateExternalPosition policy hook
    function __decodeCreateExternalPositionValidationData(bytes memory _validationData)
        internal
        pure
        returns (
            address caller_,
            uint256 typeId_,
            bytes memory initializationData_
        )
    {
        return abi.decode(_validationData, (address, uint256, bytes));
    }

    /// @dev Helper to parse validation arguments from encoded data for PreTransferShares policy hook
    function __decodePreTransferSharesValidationData(bytes memory _validationData)
        internal
        pure
        returns (
            address sender_,
            address recipient_,
            uint256 amount_
        )
    {
        return abi.decode(_validationData, (address, address, uint256));
    }

    /// @dev Helper to parse validation arguments from encoded data for PostBuyShares policy hook
    function __decodePostBuySharesValidationData(bytes memory _validationData)
        internal
        pure
        returns (
            address buyer_,
            uint256 investmentAmount_,
            uint256 sharesIssued_,
            uint256 gav_
        )
    {
        return abi.decode(_validationData, (address, uint256, uint256, uint256));
    }

    /// @dev Helper to parse validation arguments from encoded data for PostCallOnExternalPosition policy hook
    function __decodePostCallOnExternalPositionValidationData(bytes memory _validationData)
        internal
        pure
        returns (
            address caller_,
            address externalPosition_,
            address[] memory assetsToTransfer_,
            uint256[] memory amountsToTransfer_,
            address[] memory assetsToReceive_,
            bytes memory encodedActionData_
        )
    {
        return
            abi.decode(
                _validationData,
                (address, address, address[], uint256[], address[], bytes)
            );
    }

    /// @dev Helper to parse validation arguments from encoded data for PostCallOnIntegration policy hook
    function __decodePostCallOnIntegrationValidationData(bytes memory _validationData)
        internal
        pure
        returns (
            address caller_,
            address adapter_,
            bytes4 selector_,
            address[] memory incomingAssets_,
            uint256[] memory incomingAssetAmounts_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_
        )
    {
        return
            abi.decode(
                _validationData,
                (address, address, bytes4, address[], uint256[], address[], uint256[])
            );
    }

    /// @dev Helper to parse validation arguments from encoded data for ReactivateExternalPosition policy hook
    function __decodeReactivateExternalPositionValidationData(bytes memory _validationData)
        internal
        pure
        returns (address caller_, address externalPosition_)
    {
        return abi.decode(_validationData, (address, address));
    }

    /// @dev Helper to parse validation arguments from encoded data for RedeemSharesForSpecificAssets policy hook
    function __decodeRedeemSharesForSpecificAssetsValidationData(bytes memory _validationData)
        internal
        pure
        returns (
            address redeemer_,
            address recipient_,
            uint256 sharesToRedeemPostFees_,
            address[] memory assets_,
            uint256[] memory assetAmounts_,
            uint256 gavPreRedeem_
        )
    {
        return
            abi.decode(
                _validationData,
                (address, address, uint256, address[], uint256[], uint256)
            );
    }

    /// @dev Helper to parse validation arguments from encoded data for RemoveExternalPosition policy hook
    function __decodeRemoveExternalPositionValidationData(bytes memory _validationData)
        internal
        pure
        returns (address caller_, address externalPosition_)
    {
        return abi.decode(_validationData, (address, address));
    }

    /// @dev Helper to parse validation arguments from encoded data for RemoveTrackedAssets policy hook
    function __decodeRemoveTrackedAssetsValidationData(bytes memory _validationData)
        internal
        pure
        returns (address caller_, address[] memory assets_)
    {
        return abi.decode(_validationData, (address, address[]));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `POLICY_MANAGER` variable value
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    function getPolicyManager() external view returns (address policyManager_) {
        return POLICY_MANAGER;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IComptroller} from "../../../../core/fund/comptroller/IComptroller.sol";
import {IVault} from "../../../../core/fund/vault/IVault.sol";
import {IExternalPositionProxy} from "../../../../../persistent/external-positions/IExternalPositionProxy.sol";
import {IPolicyManager} from "../../IPolicyManager.sol";
import {UintListRegistryPerUserPolicyBase} from "../utils/0.6.12/UintListRegistryPerUserPolicyBase.sol";

/// @title AllowedExternalPositionTypesPerManagerPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that limits which external position types an asset manager can use for a given fund
contract AllowedExternalPositionTypesPerManagerPolicy is UintListRegistryPerUserPolicyBase {
    uint256 public constant BYPASS_FLAG = type(uint256).max;

    constructor(address _policyManager, address _uintListRegistry)
        public
        UintListRegistryPerUserPolicyBase(_policyManager, _uintListRegistry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Whether or not the policy can be disabled
    /// @return canDisable_ True if the policy can be disabled
    function canDisable() external pure virtual override returns (bool canDisable_) {
        return true;
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "ALLOWED_EXTERNAL_POSITION_TYPES_PER_MANAGER";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](4);
        implementedHooks_[0] = IPolicyManager.PolicyHook.CreateExternalPosition;
        implementedHooks_[1] = IPolicyManager.PolicyHook.PostCallOnExternalPosition;
        implementedHooks_[2] = IPolicyManager.PolicyHook.ReactivateExternalPosition;
        implementedHooks_[3] = IPolicyManager.PolicyHook.RemoveExternalPosition;

        return implementedHooks_;
    }

    /// @notice Updates the policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev Assigns a new array of lists (does not add/remove lists nor update items in a list)
    function updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        __updateListsForFund(_comptrollerProxy, _encodedSettings);
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _hook The PolicyHook
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary, as state is not updated and no events are fired
    function validateRule(address _comptrollerProxy, IPolicyManager.PolicyHook _hook, bytes calldata _encodedArgs)
        external
        override
        returns (bool isValid_)
    {
        uint256 externalPositionTypeId;
        address caller;
        if (_hook == IPolicyManager.PolicyHook.CreateExternalPosition) {
            (caller, externalPositionTypeId,) = __decodeCreateExternalPositionValidationData(_encodedArgs);
        } else if (_hook == IPolicyManager.PolicyHook.PostCallOnExternalPosition) {
            address externalPosition;
            (caller, externalPosition,,,,) = __decodePostCallOnExternalPositionValidationData(_encodedArgs);
            externalPositionTypeId = IExternalPositionProxy(externalPosition).getExternalPositionType();
        } else if (_hook == IPolicyManager.PolicyHook.ReactivateExternalPosition) {
            address externalPosition;
            (caller, externalPosition) = __decodeReactivateExternalPositionValidationData(_encodedArgs);
            externalPositionTypeId = IExternalPositionProxy(externalPosition).getExternalPositionType();
        } else {
            // PolicyHook.RemoveExternalPosition
            address externalPosition;
            (caller, externalPosition) = __decodeRemoveExternalPositionValidationData(_encodedArgs);
            externalPositionTypeId = IExternalPositionProxy(externalPosition).getExternalPositionType();
        }

        return passesRule(_comptrollerProxy, caller, externalPositionTypeId);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _caller The caller for which to check the rule
    /// @param _externalPositionTypeId The external position type id for which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address _caller, uint256 _externalPositionTypeId)
        public
        view
        returns (bool isValid_)
    {
        if (_caller == IVault(IComptroller(_comptrollerProxy).getVaultProxy()).getOwner()) {
            // fund owner passes rule by default
            return true;
        }

        uint256[] memory listIds = getListIdsForFundAndUser(_comptrollerProxy, _caller);

        if (listIds.length == 0) {
            // A manager without any configured lists does not pass the rule
            return false;
        }

        if (listIds[0] == BYPASS_FLAG) {
            // The bypass flag is only accepted if in the first position in listIds
            return true;
        }

        return UINT_LIST_REGISTRY_CONTRACT.isInSomeOfLists(listIds, _externalPositionTypeId);
    }
}

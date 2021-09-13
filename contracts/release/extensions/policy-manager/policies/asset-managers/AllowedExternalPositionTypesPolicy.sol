// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../persistent/external-positions/IExternalPositionProxy.sol";
import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "../utils/PolicyBase.sol";

/// @title AllowedExternalPositionTypesPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that limits external position types that can be used by a fund
contract AllowedExternalPositionTypesPolicy is PolicyBase {
    event AllowedExternalPositionTypeAddedForFund(
        address indexed comptrollerProxy,
        uint256 indexed externalPositionTypeId
    );

    constructor(address _policyManager) public PolicyBase(_policyManager) {}

    mapping(address => mapping(uint256 => bool))
        private comptrollerProxyToExternalPositionTypeToIsAllowed;

    /// @notice Validates and initializes a policy as necessary prior to fund activation
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    function activateForFund(address _comptrollerProxy) external override onlyPolicyManager {
        address[] memory activeExternalPositions = VaultLib(
            payable(ComptrollerLib(_comptrollerProxy).getVaultProxy())
        )
            .getActiveExternalPositions();
        for (uint256 i; i < activeExternalPositions.length; i++) {
            require(
                externalPositionTypeIsAllowedForFund(
                    _comptrollerProxy,
                    IExternalPositionProxy(activeExternalPositions[i]).getExternalPositionType()
                ),
                "activateForFund: Disallowed ExternalPositionType"
            );
        }
    }

    /// @notice Adds the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev Most funds that use this policy will likely not allow any external positions.
    /// Does not prohibit specifying not-yet-defined external position type ids.
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        uint256[] memory allowedExternalPositionTypeIds = abi.decode(
            _encodedSettings,
            (uint256[])
        );
        for (uint256 i; i < allowedExternalPositionTypeIds.length; i++) {
            comptrollerProxyToExternalPositionTypeToIsAllowed[_comptrollerProxy][allowedExternalPositionTypeIds[i]] = true;

            emit AllowedExternalPositionTypeAddedForFund(
                _comptrollerProxy,
                allowedExternalPositionTypeIds[i]
            );
        }
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "ALLOWED_EXTERNAL_POSITION_TYPES";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        pure
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](2);
        implementedHooks_[0] = IPolicyManager.PolicyHook.CreateExternalPosition;
        implementedHooks_[1] = IPolicyManager.PolicyHook.ReactivateExternalPosition;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _hook The PolicyHook
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    function validateRule(
        address _comptrollerProxy,
        IPolicyManager.PolicyHook _hook,
        bytes calldata _encodedArgs
    ) external override returns (bool isValid_) {
        uint256 externalPositionTypeId;
        if (_hook == IPolicyManager.PolicyHook.CreateExternalPosition) {
            (, externalPositionTypeId, ) = __decodeCreateExternalPositionValidationData(
                _encodedArgs
            );
        } else {
            // PolicyHook.ReactivateExternalPosition
            (, address externalPosition) = __decodeReactivateExternalPositionValidationData(
                _encodedArgs
            );
            externalPositionTypeId = IExternalPositionProxy(externalPosition)
                .getExternalPositionType();
        }

        return externalPositionTypeIsAllowedForFund(_comptrollerProxy, externalPositionTypeId);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Checks whether a given external position type is allowed by a given fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _externalPositionTypeId The external position type id
    /// @return isAllowed_ True if the external position type is allowed
    function externalPositionTypeIsAllowedForFund(
        address _comptrollerProxy,
        uint256 _externalPositionTypeId
    ) public view returns (bool isAllowed_) {
        return
            comptrollerProxyToExternalPositionTypeToIsAllowed[_comptrollerProxy][_externalPositionTypeId];
    }
}

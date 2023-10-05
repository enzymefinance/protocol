// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    
    (c) Enzyme Council <council@enzyme.finance>
    
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {IExternalPosition} from "../../../persistent/external-positions/IExternalPosition.sol";
import {IExternalPositionFactory} from "../../../persistent/external-positions/IExternalPositionFactory.sol";
import {IExternalPositionProxy} from "../../../persistent/external-positions/IExternalPositionProxy.sol";
import {IVault} from "../../core/fund/vault/IVault.sol";
import {IPolicyManager} from "../policy-manager/IPolicyManager.sol";
import {ExtensionBase} from "../utils/ExtensionBase.sol";
import {PermissionedVaultActionMixin} from "../utils/PermissionedVaultActionMixin.sol";
import {IExternalPositionParser} from "./external-positions/IExternalPositionParser.sol";
import {IExternalPositionManager} from "./IExternalPositionManager.sol";

/// @title ExternalPositionManager
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Extension to handle external position actions for funds
contract ExternalPositionManager is IExternalPositionManager, ExtensionBase, PermissionedVaultActionMixin {
    event CallOnExternalPositionExecutedForFund(
        address indexed caller,
        address indexed comptrollerProxy,
        address indexed externalPosition,
        uint256 actionId,
        bytes actionArgs,
        address[] assetsToTransfer,
        uint256[] amountsToTransfer,
        address[] assetsToReceive
    );

    event ExternalPositionDeployedForFund(
        address indexed comptrollerProxy,
        address indexed vaultProxy,
        address externalPosition,
        uint256 indexed externalPositionTypeId,
        bytes data
    );

    event ExternalPositionTypeInfoUpdated(uint256 indexed typeId, address lib, address parser);

    address private immutable EXTERNAL_POSITION_FACTORY;
    address private immutable POLICY_MANAGER;

    mapping(uint256 => ExternalPositionTypeInfo) private typeIdToTypeInfo;

    constructor(address _fundDeployer, address _externalPositionFactory, address _policyManager)
        public
        ExtensionBase(_fundDeployer)
    {
        EXTERNAL_POSITION_FACTORY = _externalPositionFactory;
        POLICY_MANAGER = _policyManager;
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Enables the ExternalPositionManager to be used by a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    function setConfigForFund(address _comptrollerProxy, address _vaultProxy, bytes calldata)
        external
        override
        onlyFundDeployer
    {
        __setValidatedVaultProxy(_comptrollerProxy, _vaultProxy);
    }

    ///////////////////////////////
    // CALL-ON-EXTENSION ACTIONS //
    ///////////////////////////////

    /// @notice Receives a dispatched `callOnExtension` from a fund's ComptrollerProxy
    /// @param _caller The user who called for this action
    /// @param _actionId An ID representing the desired action
    /// @param _callArgs The encoded args for the action
    function receiveCallFromComptroller(address _caller, uint256 _actionId, bytes calldata _callArgs)
        external
        override
    {
        address comptrollerProxy = msg.sender;

        // This validation comes at negligible cost but is not strictly necessary,
        // as all actions below call permissioned actions on the VaultProxy,
        // which will fail for an invalid ComptrollerProxy
        address vaultProxy = getVaultProxyForFund(comptrollerProxy);
        require(vaultProxy != address(0), "receiveCallFromComptroller: Fund is not valid");

        require(IVault(vaultProxy).canManageAssets(_caller), "receiveCallFromComptroller: Unauthorized");

        // Dispatch the action
        if (_actionId == uint256(ExternalPositionManagerActions.CreateExternalPosition)) {
            __createExternalPosition(_caller, comptrollerProxy, vaultProxy, _callArgs);
        } else if (_actionId == uint256(ExternalPositionManagerActions.CallOnExternalPosition)) {
            (address externalPosition, uint256 actionId, bytes memory actionArgs) =
                __decodeCallOnExternalPositionCallArgs(_callArgs);
            __executeCallOnExternalPosition(_caller, comptrollerProxy, externalPosition, actionId, actionArgs);
        } else if (_actionId == uint256(ExternalPositionManagerActions.RemoveExternalPosition)) {
            __executeRemoveExternalPosition(_caller, comptrollerProxy, _callArgs);
        } else if (_actionId == uint256(ExternalPositionManagerActions.ReactivateExternalPosition)) {
            __reactivateExternalPosition(_caller, comptrollerProxy, vaultProxy, _callArgs);
        } else {
            revert("receiveCallFromComptroller: Invalid _actionId");
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Creates a new external position and links it to the _vaultProxy
    function __createExternalPosition(
        address _caller,
        address _comptrollerProxy,
        address _vaultProxy,
        bytes memory _callArgs
    ) private {
        (uint256 typeId, bytes memory initializationData, bytes memory callOnExternalPositionCallArgs) =
            abi.decode(_callArgs, (uint256, bytes, bytes));

        address parser = getExternalPositionParserForType(typeId);
        require(parser != address(0), "__createExternalPosition: Invalid typeId");

        IPolicyManager(getPolicyManager()).validatePolicies(
            _comptrollerProxy,
            IPolicyManager.PolicyHook.CreateExternalPosition,
            abi.encode(_caller, typeId, initializationData)
        );

        // Pass in _vaultProxy in case the external position requires it during init() or further operations
        bytes memory initArgs = IExternalPositionParser(parser).parseInitArgs(_vaultProxy, initializationData);

        bytes memory constructData = abi.encodeWithSelector(IExternalPosition.init.selector, initArgs);

        address externalPosition = IExternalPositionFactory(EXTERNAL_POSITION_FACTORY).deploy(
            _vaultProxy, typeId, getExternalPositionLibForType(typeId), constructData
        );

        emit ExternalPositionDeployedForFund(_comptrollerProxy, _vaultProxy, externalPosition, typeId, initArgs);

        __addExternalPosition(_comptrollerProxy, externalPosition);

        // Execute a first action on the external position
        if (callOnExternalPositionCallArgs.length != 0) {
            // Ignores user-input externalPosition value
            (, uint256 actionId, bytes memory actionArgs) =
                __decodeCallOnExternalPositionCallArgs(callOnExternalPositionCallArgs);
            __executeCallOnExternalPosition(_caller, _comptrollerProxy, externalPosition, actionId, actionArgs);
        }
    }

    /// @dev Helper to decode callOnExternalPosition args
    function __decodeCallOnExternalPositionCallArgs(bytes memory _callArgs)
        private
        pure
        returns (address externalPosition_, uint256 actionId_, bytes memory actionArgs_)
    {
        return abi.decode(_callArgs, (address, uint256, bytes));
    }

    /// @dev Performs an action on a specific external position
    function __executeCallOnExternalPosition(
        address _caller,
        address _comptrollerProxy,
        address _externalPosition,
        uint256 _actionId,
        bytes memory _actionArgs
    ) private {
        address parser =
            getExternalPositionParserForType(IExternalPositionProxy(_externalPosition).getExternalPositionType());

        (address[] memory assetsToTransfer, uint256[] memory amountsToTransfer, address[] memory assetsToReceive) =
            IExternalPositionParser(parser).parseAssetsForAction(_externalPosition, _actionId, _actionArgs);

        bytes memory encodedActionData = abi.encode(_actionId, _actionArgs);

        __callOnExternalPosition(
            _comptrollerProxy,
            abi.encode(_externalPosition, encodedActionData, assetsToTransfer, amountsToTransfer, assetsToReceive)
        );

        IPolicyManager(getPolicyManager()).validatePolicies(
            _comptrollerProxy,
            IPolicyManager.PolicyHook.PostCallOnExternalPosition,
            abi.encode(
                _caller, _externalPosition, assetsToTransfer, amountsToTransfer, assetsToReceive, encodedActionData
            )
        );

        emit CallOnExternalPositionExecutedForFund(
            _caller,
            _comptrollerProxy,
            _externalPosition,
            _actionId,
            _actionArgs,
            assetsToTransfer,
            amountsToTransfer,
            assetsToReceive
        );
    }

    /// @dev Removes an external position from the VaultProxy
    function __executeRemoveExternalPosition(address _caller, address _comptrollerProxy, bytes memory _callArgs)
        private
    {
        address externalPosition = abi.decode(_callArgs, (address));

        IPolicyManager(getPolicyManager()).validatePolicies(
            _comptrollerProxy, IPolicyManager.PolicyHook.RemoveExternalPosition, abi.encode(_caller, externalPosition)
        );

        __removeExternalPosition(_comptrollerProxy, externalPosition);
    }

    ///@dev Reactivates an existing externalPosition
    function __reactivateExternalPosition(
        address _caller,
        address _comptrollerProxy,
        address _vaultProxy,
        bytes memory _callArgs
    ) private {
        address externalPosition = abi.decode(_callArgs, (address));

        require(
            IExternalPositionFactory(getExternalPositionFactory()).isExternalPositionProxy(externalPosition),
            "__reactivateExternalPosition: Account provided is not a valid external position"
        );

        require(
            IExternalPositionProxy(externalPosition).getVaultProxy() == _vaultProxy,
            "__reactivateExternalPosition: External position belongs to a different vault"
        );

        IPolicyManager(getPolicyManager()).validatePolicies(
            _comptrollerProxy,
            IPolicyManager.PolicyHook.ReactivateExternalPosition,
            abi.encode(_caller, externalPosition)
        );

        __addExternalPosition(_comptrollerProxy, externalPosition);
    }

    ///////////////////////////////////////////
    // EXTERNAL POSITION TYPES INFO REGISTRY //
    ///////////////////////////////////////////

    /// @notice Updates the libs and parsers for a set of external position type ids
    /// @param _typeIds The external position type ids for which to set the libs and parsers
    /// @param _libs The libs
    /// @param _parsers The parsers
    function updateExternalPositionTypesInfo(
        uint256[] memory _typeIds,
        address[] memory _libs,
        address[] memory _parsers
    ) external onlyFundDeployerOwner {
        require(
            _typeIds.length == _parsers.length && _libs.length == _parsers.length,
            "updateExternalPositionTypesInfo: Unequal arrays"
        );

        for (uint256 i; i < _typeIds.length; i++) {
            require(
                _typeIds[i] < IExternalPositionFactory(getExternalPositionFactory()).getPositionTypeCounter(),
                "updateExternalPositionTypesInfo: Type does not exist"
            );

            typeIdToTypeInfo[_typeIds[i]] = ExternalPositionTypeInfo({lib: _libs[i], parser: _parsers[i]});

            emit ExternalPositionTypeInfoUpdated(_typeIds[i], _libs[i], _parsers[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EXTERNAL_POSITION_FACTORY` variable
    /// @return externalPositionFactory_ The `EXTERNAL_POSITION_FACTORY` variable value
    function getExternalPositionFactory() public view returns (address externalPositionFactory_) {
        return EXTERNAL_POSITION_FACTORY;
    }

    /// @notice Gets the external position library contract for a given type
    /// @param _typeId The type for which to get the external position library
    /// @return lib_ The external position library
    function getExternalPositionLibForType(uint256 _typeId) public view override returns (address lib_) {
        return typeIdToTypeInfo[_typeId].lib;
    }

    /// @notice Gets the external position parser contract for a given type
    /// @param _typeId The type for which to get the external position's parser
    /// @return parser_ The external position parser
    function getExternalPositionParserForType(uint256 _typeId) public view returns (address parser_) {
        return typeIdToTypeInfo[_typeId].parser;
    }

    /// @notice Gets the `POLICY_MANAGER` variable
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    function getPolicyManager() public view returns (address policyManager_) {
        return POLICY_MANAGER;
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

enum Actions {
    CreateExternalPosition,
    CallOnExternalPosition,
    RemoveExternalPosition,
    ReactivateExternalPosition
}

abstract contract ExternalPositionUtils is CoreUtilsBase {
    function callOnExternalPosition(
        IExternalPositionManager _externalPositionManager,
        IComptroller _comptrollerProxy,
        address _externalPositionAddress,
        uint256 _actionId,
        bytes memory _actionArgs
    ) internal {
        bytes memory callArgs = abi.encode(_externalPositionAddress, _actionId, _actionArgs);

        _comptrollerProxy.callOnExtension({
            _extension: address(_externalPositionManager),
            _actionId: uint256(Actions.CallOnExternalPosition),
            _callArgs: callArgs
        });
    }

    function createExternalPosition(
        IExternalPositionManager _externalPositionManager,
        IComptroller _comptrollerProxy,
        uint256 _typeId,
        bytes memory _initializationData,
        bytes memory _callOnExternalPositionCallArgs
    ) internal returns (address externalPositionAddress_) {
        bytes memory callArgs = abi.encode(_typeId, _initializationData, _callOnExternalPositionCallArgs);

        // IMPORTANT: This must precede any other calls in the function (for assertions on this call)
        _comptrollerProxy.callOnExtension({
            _extension: address(_externalPositionManager),
            _actionId: uint256(Actions.CreateExternalPosition),
            _callArgs: callArgs
        });

        // Find the external position by taking the last-activated external position for the relevant vault
        IVault vaultProxy = IVault(_comptrollerProxy.getVaultProxy());
        address[] memory activeExternalPositions = vaultProxy.getActiveExternalPositions();

        return activeExternalPositions[activeExternalPositions.length - 1];
    }

    function registerExternalPositionType(
        IExternalPositionManager _externalPositionManager,
        string memory _label,
        address _lib,
        address _parser
    ) internal returns (uint256 typeId_) {
        IExternalPositionFactory externalPositionFactory =
            IExternalPositionFactory(_externalPositionManager.getExternalPositionFactory());
        IDispatcher dispatcher = IDispatcher(externalPositionFactory.getDispatcher());

        // Register a new type on the ExternalPositionFactory
        typeId_ = externalPositionFactory.getPositionTypeCounter();

        address dispatcherOwner = dispatcher.getOwner();
        vm.prank(dispatcherOwner);

        externalPositionFactory.addNewPositionTypes(toArray(_label));

        // Register the lib and parser on the ExternalPositionManager
        address epmOwner = _externalPositionManager.getOwner();
        vm.prank(epmOwner);

        _externalPositionManager.updateExternalPositionTypesInfo({
            _typeIds: toArray(typeId_),
            _libs: toArray(_lib),
            _parsers: toArray(_parser)
        });

        return typeId_;
    }
}

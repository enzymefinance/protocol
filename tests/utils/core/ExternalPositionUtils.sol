// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IExternalPositionManager as IExternalPositionManagerProd} from
    "contracts/release/extensions/external-position-manager/IExternalPositionManager.sol";

import {VmSafe} from "forge-std/Vm.sol";

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

abstract contract ExternalPositionUtils is CoreUtilsBase {
    // ACTIONS

    function callOnExternalPosition(
        IExternalPositionManager _externalPositionManager,
        IComptrollerLib _comptrollerProxy,
        address _externalPositionAddress,
        uint256 _actionId,
        bytes memory _actionArgs
    ) internal {
        bytes memory callArgs = abi.encode(_externalPositionAddress, _actionId, _actionArgs);

        _comptrollerProxy.callOnExtension({
            _extension: address(_externalPositionManager),
            _actionId: uint256(IExternalPositionManagerProd.ExternalPositionManagerActions.CallOnExternalPosition),
            _callArgs: callArgs
        });
    }

    function createExternalPosition(
        IExternalPositionManager _externalPositionManager,
        IComptrollerLib _comptrollerProxy,
        uint256 _typeId,
        bytes memory _initializationData,
        bytes memory _callOnExternalPositionCallArgs
    ) internal returns (address externalPositionAddress_) {
        bytes memory callArgs = abi.encode(_typeId, _initializationData, _callOnExternalPositionCallArgs);

        // IMPORTANT: This must precede any other calls in the function (for assertions on this call)
        _comptrollerProxy.callOnExtension({
            _extension: address(_externalPositionManager),
            _actionId: uint256(IExternalPositionManagerProd.ExternalPositionManagerActions.CreateExternalPosition),
            _callArgs: callArgs
        });

        // Find the external position by taking the last-activated external position for the relevant vault
        IVaultLib vaultProxy = IVaultLib(payable(_comptrollerProxy.getVaultProxy()));
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

    // MISC

    function assertExternalPositionAssetsToReceive(
        VmSafe.Log[] memory _logs,
        IExternalPositionManager _externalPositionManager,
        address[] memory _assets
    ) internal {
        bytes32 selector = bytes32(
            keccak256(
                "CallOnExternalPositionExecutedForFund(address,address,address,uint256,bytes,address[],uint256[],address[])"
            )
        );

        VmSafe.Log[] memory matchingLogs =
            filterLogsMatchingSelector({_logs: _logs, _selector: selector, _emitter: address(_externalPositionManager)});

        assertEq(matchingLogs.length, 1, "assertExternalPositionAssetsToReceive: event not found");

        (,,,, address[] memory assetsToReceive) =
            abi.decode(matchingLogs[0].data, (uint256, bytes, address[], uint256[], address[]));

        assertEq(_assets, assetsToReceive, "assertExternalPositionAssetsToReceive: mismatch");
    }
}

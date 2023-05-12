// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IExternalPositionProxy} from "tests/interfaces/internal/IExternalPositionProxy.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

enum ExternalPositionManagerActions {
    CreateExternalPosition,
    CallOnExternalPosition,
    RemoveExternalPosition,
    ReactivateExternalPosition
}

abstract contract ExternalPositionUtils is Test {
    function callOnExternalPosition(
        IExternalPositionManager _externalPositionManager,
        IComptroller _comptrollerProxy,
        address _vaultOwner,
        bytes memory _callArgs
    ) internal {
        address externalPositionManager = address(_externalPositionManager);
        uint256 actionId = uint256(ExternalPositionManagerActions.CallOnExternalPosition);

        vm.prank(_vaultOwner);
        _comptrollerProxy.callOnExtension(externalPositionManager, actionId, _callArgs);
    }

    function createExternalPosition(
        IExternalPositionManager _externalPositionManager,
        IComptroller _comptrollerProxy,
        uint256 _typeId
    ) internal returns (IExternalPositionProxy externalPositionProxy_) {
        address externalPositionManager = address(_externalPositionManager);

        bytes memory callArgs = abi.encode(_typeId, "", "");
        uint256 actionId = uint256(ExternalPositionManagerActions.CreateExternalPosition);

        IVault vaultProxy = IVault(payable(_comptrollerProxy.getVaultProxy()));

        vm.prank(vaultProxy.getOwner());
        _comptrollerProxy.callOnExtension(externalPositionManager, actionId, callArgs);

        address[] memory activeExternalPositions = vaultProxy.getActiveExternalPositions();

        return IExternalPositionProxy(activeExternalPositions[activeExternalPositions.length - 1]);
    }

    function registerExternalPositions(
        IExternalPositionManager _externalPositionManager,
        string[] memory _labels,
        address[] memory _libs,
        address[] memory _parsers
    ) internal returns (uint256[] memory typeIds) {
        IExternalPositionFactory externalPositionFactory =
            IExternalPositionFactory(_externalPositionManager.getExternalPositionFactory());
        uint256 oldPositionTypeCounter = externalPositionFactory.getPositionTypeCounter();
        address dispatcherOwner = IDispatcher(externalPositionFactory.getDispatcher()).getOwner();

        typeIds = new uint256[](_labels.length);
        for (uint256 i; i < _labels.length; i++) {
            typeIds[i] = oldPositionTypeCounter + i;
        }

        vm.startPrank(dispatcherOwner);
        externalPositionFactory.addNewPositionTypes(_labels);
        _externalPositionManager.updateExternalPositionTypesInfo(typeIds, _libs, _parsers);
        vm.stopPrank();

        return typeIds;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

/// @title IExternalPositionFactory Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IExternalPositionFactory {
    function deploy(address _vaultProxy, uint256 _typeId, address _constructLib, bytes memory _constructData)
        external
        returns (address externalPositionProxy_);

    ////////////////////
    // TYPES REGISTRY //
    ////////////////////

    function addNewPositionTypes(string[] calldata _labels) external;

    function updatePositionTypeLabels(uint256[] calldata _typeIds, string[] calldata _labels) external;

    /////////////////////////////////
    // POSITION DEPLOYERS REGISTRY //
    /////////////////////////////////

    function addPositionDeployers(address[] memory _accounts) external;

    function removePositionDeployers(address[] memory _accounts) external;

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getDispatcher() external view returns (address dispatcher_);

    function getLabelForPositionType(uint256 _typeId) external view returns (string memory label_);

    function getPositionTypeCounter() external view returns (uint256 positionTypeCounter_);

    function isExternalPositionProxy(address _account) external view returns (bool isExternalPositionProxy_);

    function isPositionDeployer(address _account) external view returns (bool isPositionDeployer_);
}

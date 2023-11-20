// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IExternalPositionManager {
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
    event ValidatedVaultProxySetForFund(address indexed comptrollerProxy, address indexed vaultProxy);

    function activateForFund(bool) external;
    function deactivateForFund() external;
    function getExternalPositionFactory() external view returns (address externalPositionFactory_);
    function getExternalPositionLibForType(uint256 _typeId) external view returns (address lib_);
    function getExternalPositionParserForType(uint256 _typeId) external view returns (address parser_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getOwner() external view returns (address owner_);
    function getPolicyManager() external view returns (address policyManager_);
    function getVaultProxyForFund(address _comptrollerProxy) external view returns (address vaultProxy_);
    function receiveCallFromComptroller(address _caller, uint256 _actionId, bytes memory _callArgs) external;
    function setConfigForFund(address _comptrollerProxy, address _vaultProxy, bytes memory) external;
    function updateExternalPositionTypesInfo(
        uint256[] memory _typeIds,
        address[] memory _libs,
        address[] memory _parsers
    ) external;
}

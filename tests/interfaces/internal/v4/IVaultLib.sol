// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IVaultLib {
    event AccessorSet(address prevAccessor, address nextAccessor);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AssetManagerAdded(address manager);
    event AssetManagerRemoved(address manager);
    event AssetWithdrawn(address indexed asset, address indexed target, uint256 amount);
    event EthReceived(address indexed sender, uint256 amount);
    event ExternalPositionAdded(address indexed externalPosition);
    event ExternalPositionRemoved(address indexed externalPosition);
    event FreelyTransferableSharesSet();
    event MigratorSet(address prevMigrator, address nextMigrator);
    event NameSet(string name);
    event NominatedOwnerRemoved(address indexed nominatedOwner);
    event NominatedOwnerSet(address indexed nominatedOwner);
    event OwnerSet(address prevOwner, address nextOwner);
    event OwnershipTransferred(address indexed prevOwner, address indexed nextOwner);
    event ProtocolFeePaidInShares(uint256 sharesAmount);
    event ProtocolFeeSharesBoughtBack(uint256 sharesAmount, uint256 mlnValue, uint256 mlnBurned);
    event SymbolSet(string symbol);
    event TrackedAssetAdded(address asset);
    event TrackedAssetRemoved(address asset);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event VaultLibSet(address prevVaultLib, address nextVaultLib);

    function addAssetManagers(address[] memory _managers) external;
    function addTrackedAsset(address _asset) external;
    function allowance(address _owner, address _spender) external view returns (uint256);
    function approve(address _spender, uint256 _amount) external returns (bool);
    function balanceOf(address _account) external view returns (uint256);
    function burnShares(address _target, uint256 _amount) external;
    function buyBackProtocolFeeShares(uint256 _sharesAmount, uint256 _mlnValue, uint256 _gav) external;
    function callOnContract(address _contract, bytes memory _callData) external returns (bytes memory returnData_);
    function canManageAssets(address _who) external view returns (bool canManageAssets_);
    function canMigrate(address _who) external view returns (bool canMigrate_);
    function canRelayCalls(address _who) external view returns (bool canRelayCalls_);
    function claimOwnership() external;
    function decimals() external pure returns (uint8);
    function getAccessor() external view returns (address accessor_);
    function getActiveExternalPositions() external view returns (address[] memory activeExternalPositions_);
    function getCreator() external view returns (address creator_);
    function getExternalPositionLibForType(uint256 _typeId) external view returns (address externalPositionLib_);
    function getExternalPositionManager() external view returns (address externalPositionManager_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getGasRelayPaymasterFactory() external view returns (address gasRelayPaymasterFactory_);
    function getGasRelayTrustedForwarder() external view returns (address trustedForwarder_);
    function getMigrator() external view returns (address migrator_);
    function getMlnBurner() external view returns (address mlnBurner_);
    function getMlnToken() external view returns (address mlnToken_);
    function getNominatedOwner() external view returns (address nominatedOwner_);
    function getOwner() external view returns (address owner_);
    function getPositionsLimit() external view returns (uint256 positionsLimit_);
    function getProtocolFeeReserve() external view returns (address protocolFeeReserve_);
    function getProtocolFeeTracker() external view returns (address protocolFeeTracker_);
    function getTrackedAssets() external view returns (address[] memory trackedAssets_);
    function getVaultLib() external view returns (address vaultLib_);
    function getWethToken() external view returns (address wethToken_);
    function init(address _owner, address _accessor, string memory _fundName) external;
    function isActiveExternalPosition(address _externalPosition)
        external
        view
        returns (bool isActiveExternalPosition_);
    function isAssetManager(address _who) external view returns (bool isAssetManager_);
    function isTrackedAsset(address _asset) external view returns (bool isTrackedAsset_);
    function mintShares(address _target, uint256 _amount) external;
    function name() external view returns (string memory);
    function payProtocolFee() external;
    function proxiableUUID() external pure returns (bytes32 uuid_);
    function receiveValidatedVaultAction(uint8 _action, bytes memory _actionData) external;
    function removeAssetManagers(address[] memory _managers) external;
    function removeNominatedOwner() external;
    function setAccessor(address _nextAccessor) external;
    function setAccessorForFundReconfiguration(address _nextAccessor) external;
    function setFreelyTransferableShares() external;
    function setMigrator(address _nextMigrator) external;
    function setName(string memory _nextName) external;
    function setNominatedOwner(address _nextNominatedOwner) external;
    function setSymbol(string memory _nextSymbol) external;
    function setVaultLib(address _nextVaultLib) external;
    function sharesAreFreelyTransferable() external view returns (bool sharesAreFreelyTransferable_);
    function symbol() external view returns (string memory symbol_);
    function totalSupply() external view returns (uint256);
    function transfer(address _recipient, uint256 _amount) external returns (bool success_);
    function transferFrom(address _sender, address _recipient, uint256 _amount) external returns (bool success_);
    function transferShares(address _from, address _to, uint256 _amount) external;
    function withdrawAssetTo(address _asset, address _target, uint256 _amount) external;
}

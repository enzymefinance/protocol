// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IFundDeployer {
    event BuySharesOnBehalfCallerDeregistered(address caller);
    event BuySharesOnBehalfCallerRegistered(address caller);
    event ComptrollerLibSet(address comptrollerLib);
    event ComptrollerProxyDeployed(
        address indexed creator,
        address comptrollerProxy,
        address indexed denominationAsset,
        uint256 sharesActionTimelock
    );
    event GasLimitsForDestructCallSet(uint256 nextDeactivateFeeManagerGasLimit, uint256 nextPayProtocolFeeGasLimit);
    event MigrationRequestCreated(address indexed creator, address indexed vaultProxy, address comptrollerProxy);
    event NewFundCreated(address indexed creator, address vaultProxy, address comptrollerProxy);
    event ProtocolFeeTrackerSet(address protocolFeeTracker);
    event ReconfigurationRequestCancelled(address indexed vaultProxy, address indexed nextComptrollerProxy);
    event ReconfigurationRequestCreated(
        address indexed creator, address indexed vaultProxy, address comptrollerProxy, uint256 executableTimestamp
    );
    event ReconfigurationRequestExecuted(
        address indexed vaultProxy, address indexed prevComptrollerProxy, address indexed nextComptrollerProxy
    );
    event ReconfigurationTimelockSet(uint256 nextTimelock);
    event ReleaseIsLive();
    event VaultCallDeregistered(address indexed contractAddress, bytes4 selector, bytes32 dataHash);
    event VaultCallRegistered(address indexed contractAddress, bytes4 selector, bytes32 dataHash);
    event VaultLibSet(address vaultLib);

    struct ReconfigurationRequest {
        address nextComptrollerProxy;
        uint256 executableTimestamp;
    }

    function cancelMigration(address _vaultProxy, bool _bypassPrevReleaseFailure) external;
    function cancelReconfiguration(address _vaultProxy) external;
    function createMigrationRequest(
        address _vaultProxy,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData,
        bool _bypassPrevReleaseFailure
    ) external returns (address comptrollerProxy_);
    function createNewFund(
        address _fundOwner,
        string memory _fundName,
        string memory _fundSymbol,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData
    ) external returns (address comptrollerProxy_, address vaultProxy_);
    function createReconfigurationRequest(
        address _vaultProxy,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData
    ) external returns (address comptrollerProxy_);
    function deregisterBuySharesOnBehalfCallers(address[] memory _callers) external;
    function deregisterVaultCalls(address[] memory _contracts, bytes4[] memory _selectors, bytes32[] memory _dataHashes)
        external;
    function executeMigration(address _vaultProxy, bool _bypassPrevReleaseFailure) external;
    function executeReconfiguration(address _vaultProxy) external;
    function getComptrollerLib() external view returns (address comptrollerLib_);
    function getCreator() external view returns (address creator_);
    function getDispatcher() external view returns (address dispatcher_);
    function getGasLimitsForDestructCall()
        external
        view
        returns (uint256 deactivateFeeManagerGasLimit_, uint256 payProtocolFeeGasLimit_);
    function getGasRelayPaymasterFactory() external view returns (address gasRelayPaymasterFactory_);
    function getGasRelayTrustedForwarder() external view returns (address trustedForwarder_);
    function getOwner() external view returns (address owner_);
    function getProtocolFeeTracker() external view returns (address protocolFeeTracker_);
    function getReconfigurationRequestForVaultProxy(address _vaultProxy)
        external
        view
        returns (ReconfigurationRequest memory reconfigurationRequest_);
    function getReconfigurationTimelock() external view returns (uint256 reconfigurationTimelock_);
    function getVaultLib() external view returns (address vaultLib_);
    function hasReconfigurationRequest(address _vaultProxy) external view returns (bool hasReconfigurationRequest_);
    function invokeMigrationInCancelHook(address, address, address _nextComptrollerProxy, address) external;
    function invokeMigrationOutHook(uint8 _hook, address _vaultProxy, address, address, address) external;
    function isAllowedBuySharesOnBehalfCaller(address _who) external view returns (bool isAllowed_);
    function isAllowedVaultCall(address _contract, bytes4 _selector, bytes32 _dataHash)
        external
        view
        returns (bool isAllowed_);
    function isRegisteredVaultCall(address _contract, bytes4 _selector, bytes32 _dataHash)
        external
        view
        returns (bool isRegistered_);
    function registerBuySharesOnBehalfCallers(address[] memory _callers) external;
    function registerVaultCalls(address[] memory _contracts, bytes4[] memory _selectors, bytes32[] memory _dataHashes)
        external;
    function releaseIsLive() external view returns (bool isLive_);
    function setComptrollerLib(address _comptrollerLib) external;
    function setGasLimitsForDestructCall(uint32 _nextDeactivateFeeManagerGasLimit, uint32 _nextPayProtocolFeeGasLimit)
        external;
    function setProtocolFeeTracker(address _protocolFeeTracker) external;
    function setReconfigurationTimelock(uint256 _nextTimelock) external;
    function setReleaseLive() external;
    function setVaultLib(address _vaultLib) external;
}

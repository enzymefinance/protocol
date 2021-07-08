// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../persistent/dispatcher/IDispatcher.sol";
import "../../../persistent/utils/IMigrationHookHandler.sol";
import "../fund/comptroller/IComptroller.sol";
import "../fund/comptroller/ComptrollerProxy.sol";
import "../fund/vault/IVault.sol";
import "./IFundDeployer.sol";

/// @title FundDeployer Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The top-level contract of the release.
/// It primarily coordinates fund deployment and fund migration, but
/// it is also deferred to for contract access control and for allowed calls
/// that can be made with a fund's VaultProxy as the msg.sender.
contract FundDeployer is IFundDeployer, IMigrationHookHandler {
    event ComptrollerLibSet(address comptrollerLib);

    event ComptrollerProxyDeployed(
        address indexed creator,
        address comptrollerProxy,
        address indexed denominationAsset,
        uint256 sharesActionTimelock,
        bytes feeManagerConfigData,
        bytes policyManagerConfigData
    );

    event MigrationRequestCreated(
        address indexed creator,
        address indexed vaultProxy,
        address comptrollerProxy
    );

    event NewFundCreated(address indexed creator, address vaultProxy, address comptrollerProxy);

    event ReconfigurationRequestCancelled(
        address indexed vaultProxy,
        address indexed nextComptrollerProxy
    );

    event ReconfigurationRequestCreated(
        address indexed creator,
        address indexed vaultProxy,
        address comptrollerProxy,
        uint256 executableTimestamp
    );

    event ReconfigurationRequestExecuted(
        address indexed vaultProxy,
        address indexed prevComptrollerProxy,
        address indexed nextComptrollerProxy
    );

    event ReconfigurationTimelockSet(uint256 nextTimelock);

    event ReleaseStatusSet(ReleaseStatus indexed prevStatus, ReleaseStatus indexed nextStatus);

    event VaultCallDeregistered(
        address indexed contractAddress,
        bytes4 selector,
        bytes32 dataHash
    );

    event VaultCallRegistered(address indexed contractAddress, bytes4 selector, bytes32 dataHash);

    event VaultLibSet(address vaultLib);

    struct ReconfigurationRequest {
        address nextComptrollerProxy;
        uint256 executableTimestamp;
    }

    // Constants
    // keccak256(abi.encodePacked("mln.vaultCall.any")
    bytes32
        private constant ANY_VAULT_CALL = 0x5bf1898dd28c4d29f33c4c1bb9b8a7e2f6322847d70be63e8f89de024d08a669;

    address private immutable CREATOR;
    address private immutable DISPATCHER;

    // Pseudo-constants (can only be set once)
    address private comptrollerLib;
    address private vaultLib;

    // Storage
    uint256 private reconfigurationTimelock;
    ReleaseStatus private releaseStatus;

    mapping(bytes32 => mapping(bytes32 => bool)) private vaultCallToPayloadToIsAllowed;
    mapping(address => ReconfigurationRequest) private vaultProxyToReconfigurationRequest;

    modifier onlyDispatcher() {
        require(msg.sender == DISPATCHER, "Only Dispatcher can call this function");
        _;
    }

    modifier onlyLiveRelease() {
        require(releaseStatus == ReleaseStatus.Live, "Release is not Live");
        _;
    }

    modifier onlyMigrator(address _vaultProxy) {
        require(
            IVault(_vaultProxy).canMigrate(msg.sender),
            "Only a permissioned migrator can call this function"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == getOwner(), "Only the contract owner can call this function");
        _;
    }

    modifier pseudoConstant(address _storageValue) {
        require(_storageValue == address(0), "This value can only be set once");
        _;
    }

    constructor(address _dispatcher) public {
        // Validate constants
        require(
            ANY_VAULT_CALL == keccak256(abi.encodePacked("mln.vaultCall.any")),
            "constructor: Incorrect ANY_VAULT_CALL"
        );

        CREATOR = msg.sender;
        DISPATCHER = _dispatcher;

        reconfigurationTimelock = 2 days;
    }

    //////////////////////////////////////
    // PSEUDO-CONSTANTS (only set once) //
    //////////////////////////////////////

    /// @notice Sets the comptrollerLib
    /// @param _comptrollerLib The ComptrollerLib contract address
    function setComptrollerLib(address _comptrollerLib)
        external
        onlyOwner
        pseudoConstant(getComptrollerLib())
    {
        comptrollerLib = _comptrollerLib;

        emit ComptrollerLibSet(_comptrollerLib);
    }

    /// @notice Sets the VaultLib
    /// @param _vaultLib The VaultLib contract address
    function setVaultLib(address _vaultLib) external onlyOwner pseudoConstant(getVaultLib()) {
        vaultLib = _vaultLib;

        emit VaultLibSet(_vaultLib);
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Sets the status of the protocol to a new state
    /// @param _nextStatus The next status state to set
    function setReleaseStatus(ReleaseStatus _nextStatus) external {
        require(
            msg.sender == getOwner(),
            "setReleaseStatus: Only the owner can call this function"
        );
        require(
            _nextStatus != ReleaseStatus.PreLaunch,
            "setReleaseStatus: Cannot return to PreLaunch status"
        );

        ReleaseStatus prevStatus = releaseStatus;
        require(_nextStatus != prevStatus, "setReleaseStatus: _nextStatus is the current status");

        if (prevStatus == ReleaseStatus.PreLaunch) {
            require(
                getComptrollerLib() != address(0),
                "setReleaseStatus: Can only set the release status when comptrollerLib is set"
            );
            require(
                getVaultLib() != address(0),
                "setReleaseStatus: Can only set the release status when vaultLib is set"
            );
        }

        releaseStatus = _nextStatus;

        emit ReleaseStatusSet(prevStatus, _nextStatus);
    }

    /// @notice Gets the current owner of the contract
    /// @return owner_ The contract owner address
    /// @dev Dynamically gets the owner based on the Protocol status. The owner is initially the
    /// contract's deployer, for convenience in setting up configuration.
    /// Ownership is claimed when the owner of the Dispatcher contract (the Enzyme Council)
    /// sets the releaseStatus to `Live`.
    function getOwner() public view override returns (address owner_) {
        if (releaseStatus == ReleaseStatus.PreLaunch) {
            return CREATOR;
        }

        return IDispatcher(DISPATCHER).getOwner();
    }

    ///////////////////
    // FUND CREATION //
    ///////////////////

    /// @notice Creates a fully-configured ComptrollerProxy instance for a VaultProxy and signals the migration process
    /// @param _vaultProxy The VaultProxy to migrate
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    /// @param _bypassPrevReleaseFailure True if should override a failure in the previous release while signaling migration
    /// @return comptrollerProxy_ The address of the ComptrollerProxy deployed during this action
    function createMigrationRequest(
        address _vaultProxy,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData,
        bool _bypassPrevReleaseFailure
    ) external onlyLiveRelease onlyMigrator(_vaultProxy) returns (address comptrollerProxy_) {
        // Bad _vaultProxy value is validated by Dispatcher.signalMigration()

        comptrollerProxy_ = __deployComptrollerProxy(
            _denominationAsset,
            _sharesActionTimelock,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        IComptroller(comptrollerProxy_).setVaultProxy(_vaultProxy);

        IDispatcher(DISPATCHER).signalMigration(
            _vaultProxy,
            comptrollerProxy_,
            getVaultLib(),
            _bypassPrevReleaseFailure
        );

        emit MigrationRequestCreated(msg.sender, _vaultProxy, comptrollerProxy_);

        return comptrollerProxy_;
    }

    /// @notice Creates a new fund
    /// @param _fundOwner The address of the owner for the fund
    /// @param _fundName The name of the fund
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    /// @return comptrollerProxy_ The address of the ComptrollerProxy deployed during this action
    function createNewFund(
        address _fundOwner,
        string calldata _fundName,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external onlyLiveRelease returns (address comptrollerProxy_, address vaultProxy_) {
        // _fundOwner is validated by VaultLib.__setOwner()

        comptrollerProxy_ = __deployComptrollerProxy(
            _denominationAsset,
            _sharesActionTimelock,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        vaultProxy_ = IDispatcher(DISPATCHER).deployVaultProxy(
            getVaultLib(),
            _fundOwner,
            comptrollerProxy_,
            _fundName
        );

        IComptroller comptrollerContract = IComptroller(comptrollerProxy_);
        comptrollerContract.setVaultProxy(vaultProxy_);
        comptrollerContract.activate(false);

        emit NewFundCreated(msg.sender, vaultProxy_, comptrollerProxy_);

        return (comptrollerProxy_, vaultProxy_);
    }

    /// @notice Creates a fully-configured ComptrollerProxy instance for a VaultProxy and signals the reconfiguration process
    /// @param _vaultProxy The VaultProxy to reconfigure
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    /// @return comptrollerProxy_ The address of the ComptrollerProxy deployed during this action
    function createReconfigurationRequest(
        address _vaultProxy,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external onlyLiveRelease onlyMigrator(_vaultProxy) returns (address comptrollerProxy_) {
        require(
            IDispatcher(DISPATCHER).getFundDeployerForVaultProxy(_vaultProxy) == address(this),
            "createReconfigurationRequest: VaultProxy not on this release"
        );
        require(
            !hasReconfigurationRequest(_vaultProxy),
            "createReconfigurationRequest: VaultProxy has a pending reconfiguration request"
        );

        comptrollerProxy_ = __deployComptrollerProxy(
            _denominationAsset,
            _sharesActionTimelock,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        IComptroller(comptrollerProxy_).setVaultProxy(_vaultProxy);

        uint256 executableTimestamp = block.timestamp + getReconfigurationTimelock();
        vaultProxyToReconfigurationRequest[_vaultProxy] = ReconfigurationRequest({
            nextComptrollerProxy: comptrollerProxy_,
            executableTimestamp: executableTimestamp
        });

        emit ReconfigurationRequestCreated(
            msg.sender,
            _vaultProxy,
            comptrollerProxy_,
            executableTimestamp
        );

        return comptrollerProxy_;
    }

    /// @dev Helper function to deploy a configured ComptrollerProxy
    function __deployComptrollerProxy(
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData
    ) private returns (address comptrollerProxy_) {
        // _denominationAsset is validated by ComptrollerLib.init()

        bytes memory constructData = abi.encodeWithSelector(
            IComptroller.init.selector,
            _denominationAsset,
            _sharesActionTimelock
        );
        comptrollerProxy_ = address(new ComptrollerProxy(constructData, getComptrollerLib()));

        if (_feeManagerConfigData.length > 0 || _policyManagerConfigData.length > 0) {
            IComptroller(comptrollerProxy_).configureExtensions(
                _feeManagerConfigData,
                _policyManagerConfigData
            );
        }

        emit ComptrollerProxyDeployed(
            msg.sender,
            comptrollerProxy_,
            _denominationAsset,
            _sharesActionTimelock,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        return comptrollerProxy_;
    }

    ///////////////////////////////////////////////
    // RECONFIGURATION (INTRA-RELEASE MIGRATION) //
    ///////////////////////////////////////////////

    /// @notice Cancels a pending reconfiguration request
    /// @param _vaultProxy The VaultProxy contract for which to cancel the reconfiguration request
    function cancelReconfiguration(address _vaultProxy)
        external
        onlyLiveRelease
        onlyMigrator(_vaultProxy)
    {
        address nextComptrollerProxy = vaultProxyToReconfigurationRequest[_vaultProxy]
            .nextComptrollerProxy;
        require(
            nextComptrollerProxy != address(0),
            "cancelReconfiguration: No reconfiguration request exists for _vaultProxy"
        );

        // Destroy the nextComptrollerProxy
        IComptroller(nextComptrollerProxy).destructUnactivated();

        // Remove the reconfiguration request
        delete vaultProxyToReconfigurationRequest[_vaultProxy];

        emit ReconfigurationRequestCancelled(_vaultProxy, nextComptrollerProxy);
    }

    /// @notice Executes a pending reconfiguration request
    /// @param _vaultProxy The VaultProxy contract for which to execute the reconfiguration request
    function executeReconfiguration(address _vaultProxy)
        external
        onlyLiveRelease
        onlyMigrator(_vaultProxy)
    {
        ReconfigurationRequest memory request = getReconfigurationRequestForVaultProxy(
            _vaultProxy
        );
        require(
            request.nextComptrollerProxy != address(0),
            "executeReconfiguration: No reconfiguration request exists for _vaultProxy"
        );
        require(
            block.timestamp >= request.executableTimestamp,
            "executeReconfiguration: The reconfiguration timelock has not elapsed"
        );
        // Not technically necessary, but a nice assurance
        require(
            IDispatcher(DISPATCHER).getFundDeployerForVaultProxy(_vaultProxy) == address(this),
            "executeReconfiguration: _vaultProxy is no longer on this release"
        );

        // TODO: add bypass failure option in case destruct action fails?
        // Unwind and destroy the prevComptrollerProxy before setting the nextComptrollerProxy as the VaultProxy.accessor
        address prevComptrollerProxy = IVault(_vaultProxy).getAccessor();
        IComptroller(prevComptrollerProxy).destructActivated();

        // Execute the reconfiguration
        IVault(_vaultProxy).setAccessorForFundReconfiguration(request.nextComptrollerProxy);

        // Activate the new ComptrollerProxy
        IComptroller(request.nextComptrollerProxy).activate(true);

        // Remove the reconfiguration request
        delete vaultProxyToReconfigurationRequest[_vaultProxy];

        emit ReconfigurationRequestExecuted(
            _vaultProxy,
            prevComptrollerProxy,
            request.nextComptrollerProxy
        );
    }

    /// @notice Sets a new reconfiguration timelock
    /// @param _nextTimelock The number of seconds for the new timelock
    function setReconfigurationTimelock(uint256 _nextTimelock) external onlyOwner {
        reconfigurationTimelock = _nextTimelock;

        emit ReconfigurationTimelockSet(_nextTimelock);
    }

    //////////////////
    // MIGRATION IN //
    //////////////////

    /// @notice Cancels fund migration
    /// @param _vaultProxy The VaultProxy for which to cancel migration
    /// @param _bypassPrevReleaseFailure True if should override a failure in the previous release while canceling migration
    function cancelMigration(address _vaultProxy, bool _bypassPrevReleaseFailure)
        external
        onlyLiveRelease
        onlyMigrator(_vaultProxy)
    {
        IDispatcher(DISPATCHER).cancelMigration(_vaultProxy, _bypassPrevReleaseFailure);
    }

    /// @notice Executes fund migration
    /// @param _vaultProxy The VaultProxy for which to execute the migration
    /// @param _bypassPrevReleaseFailure True if should override a failure in the previous release while executing migration
    function executeMigration(address _vaultProxy, bool _bypassPrevReleaseFailure)
        external
        onlyLiveRelease
        onlyMigrator(_vaultProxy)
    {
        IDispatcher dispatcherContract = IDispatcher(DISPATCHER);

        (, address comptrollerProxy, , ) = dispatcherContract
            .getMigrationRequestDetailsForVaultProxy(_vaultProxy);

        dispatcherContract.executeMigration(_vaultProxy, _bypassPrevReleaseFailure);

        IComptroller(comptrollerProxy).activate(true);
    }

    /// @notice Executes logic when a migration is canceled on the Dispatcher
    /// @param _nextComptrollerProxy The ComptrollerProxy created on this release
    function invokeMigrationInCancelHook(
        address,
        address,
        address _nextComptrollerProxy,
        address
    ) external override onlyDispatcher {
        IComptroller(_nextComptrollerProxy).destructUnactivated();
    }

    ///////////////////
    // MIGRATION OUT //
    ///////////////////

    /// @notice Allows "hooking into" specific moments in the migration pipeline
    /// to execute arbitrary logic during a migration out of this release
    /// @param _vaultProxy The VaultProxy being migrated
    function invokeMigrationOutHook(
        MigrationOutHook _hook,
        address _vaultProxy,
        address,
        address,
        address
    ) external override onlyDispatcher {
        if (_hook != MigrationOutHook.PreMigrate) {
            return;
        }

        // Must use PreMigrate hook to get the ComptrollerProxy from the VaultProxy
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();

        // Wind down fund and destroy its config
        IComptroller(comptrollerProxy).destructActivated();
    }

    /////////////////////////
    // VAULT CALL REGISTRY //
    /////////////////////////

    /// @notice De-registers allowed arbitrary contract calls that can be sent from the VaultProxy
    /// @param _contracts The contracts of the calls to de-register
    /// @param _selectors The selectors of the calls to de-register
    /// @param _dataHashes The keccak call data hashes of the calls to de-register
    /// @dev ANY_VAULT_CALL is a wildcard that allows any payload
    function deregisterVaultCalls(
        address[] calldata _contracts,
        bytes4[] calldata _selectors,
        bytes32[] memory _dataHashes
    ) external onlyOwner {
        require(_contracts.length > 0, "deregisterVaultCalls: Empty _contracts");
        require(
            _contracts.length == _selectors.length && _contracts.length == _dataHashes.length,
            "deregisterVaultCalls: Uneven input arrays"
        );

        for (uint256 i; i < _contracts.length; i++) {
            require(
                isRegisteredVaultCall(_contracts[i], _selectors[i], _dataHashes[i]),
                "deregisterVaultCalls: Call not registered"
            );

            vaultCallToPayloadToIsAllowed[keccak256(
                abi.encodePacked(_contracts[i], _selectors[i])
            )][_dataHashes[i]] = false;

            emit VaultCallDeregistered(_contracts[i], _selectors[i], _dataHashes[i]);
        }
    }

    /// @notice Registers allowed arbitrary contract calls that can be sent from the VaultProxy
    /// @param _contracts The contracts of the calls to register
    /// @param _selectors The selectors of the calls to register
    /// @param _dataHashes The keccak call data hashes of the calls to register
    /// @dev ANY_VAULT_CALL is a wildcard that allows any payload
    function registerVaultCalls(
        address[] calldata _contracts,
        bytes4[] calldata _selectors,
        bytes32[] memory _dataHashes
    ) external onlyOwner {
        require(_contracts.length > 0, "registerVaultCalls: Empty _contracts");
        require(
            _contracts.length == _selectors.length && _contracts.length == _dataHashes.length,
            "registerVaultCalls: Uneven input arrays"
        );

        for (uint256 i; i < _contracts.length; i++) {
            require(
                !isRegisteredVaultCall(_contracts[i], _selectors[i], _dataHashes[i]),
                "registerVaultCalls: Call already registered"
            );

            vaultCallToPayloadToIsAllowed[keccak256(
                abi.encodePacked(_contracts[i], _selectors[i])
            )][_dataHashes[i]] = true;

            emit VaultCallRegistered(_contracts[i], _selectors[i], _dataHashes[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CREATOR` variable value
    /// @return creator_ The `CREATOR` variable value
    function getCreator() external view returns (address creator_) {
        return CREATOR;
    }

    /// @notice Gets the `DISPATCHER` variable value
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() external view returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the `releaseStatus` variable value
    /// @return status_ The `releaseStatus` variable value
    function getReleaseStatus() external view override returns (ReleaseStatus status_) {
        return releaseStatus;
    }

    /// @notice Checks if a contract call is allowed
    /// @param _contract The contract of the call to check
    /// @param _selector The selector of the call to check
    /// @param _dataHash The keccak call data hash of the call to check
    /// @return isAllowed_ True if the call is allowed
    /// @dev A vault call is allowed if the _dataHash is specifically allowed,
    /// or if any _dataHash is allowed
    function isAllowedVaultCall(
        address _contract,
        bytes4 _selector,
        bytes32 _dataHash
    ) external view override returns (bool isAllowed_) {
        bytes32 contractFunctionHash = keccak256(abi.encodePacked(_contract, _selector));

        return
            vaultCallToPayloadToIsAllowed[contractFunctionHash][_dataHash] ||
            vaultCallToPayloadToIsAllowed[contractFunctionHash][ANY_VAULT_CALL];
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the `comptrollerLib` variable value
    /// @return comptrollerLib_ The `comptrollerLib` variable value
    function getComptrollerLib() public view returns (address comptrollerLib_) {
        return comptrollerLib;
    }

    /// @notice Gets the pending ReconfigurationRequest for a given VaultProxy
    /// @param _vaultProxy The VaultProxy instance
    /// @return reconfigurationRequest_ The pending ReconfigurationRequest
    function getReconfigurationRequestForVaultProxy(address _vaultProxy)
        public
        view
        returns (ReconfigurationRequest memory reconfigurationRequest_)
    {
        return vaultProxyToReconfigurationRequest[_vaultProxy];
    }

    /// @notice Gets the amount of time that must pass before executing a ReconfigurationRequest
    /// @return reconfigurationTimelock_ The timelock value (in seconds)
    function getReconfigurationTimelock() public view returns (uint256 reconfigurationTimelock_) {
        return reconfigurationTimelock;
    }

    /// @notice Gets the `vaultLib` variable value
    /// @return vaultLib_ The `vaultLib` variable value
    function getVaultLib() public view returns (address vaultLib_) {
        return vaultLib;
    }

    /// @notice Checks whether a ReconfigurationRequest exists for a given VaultProxy
    /// @param _vaultProxy The VaultProxy instance
    /// @return hasReconfigurationRequest_ True if a ReconfigurationRequest exists
    function hasReconfigurationRequest(address _vaultProxy)
        public
        view
        override
        returns (bool hasReconfigurationRequest_)
    {
        return vaultProxyToReconfigurationRequest[_vaultProxy].nextComptrollerProxy != address(0);
    }

    /// @notice Checks if a contract call is registered
    /// @param _contract The contract of the call to check
    /// @param _selector The selector of the call to check
    /// @param _dataHash The keccak call data hash of the call to check
    /// @return isRegistered_ True if the call is registered
    function isRegisteredVaultCall(
        address _contract,
        bytes4 _selector,
        bytes32 _dataHash
    ) public view returns (bool isRegistered_) {
        return
            vaultCallToPayloadToIsAllowed[keccak256(
                abi.encodePacked(_contract, _selector)
            )][_dataHash];
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@melonproject/persistent/contracts/dispatcher/IDispatcher.sol";
import "../../infrastructure/engine/AmguConsumer.sol";
import "../fund/comptroller/IComptroller.sol";
import "../fund/comptroller/ComptrollerProxy.sol";
import "../fund/vault/IVault.sol";
import "./IFundDeployer.sol";

/// @title FundDeployer Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract of a Melon Protocol release that
/// coordinates fund deployment and fund migration. It serves as the top-level contract
/// for a release, and is thus also deferred to for contract ownership access control.
contract FundDeployer is IFundDeployer, AmguConsumer {
    event ComptrollerLibSet(address comptrollerLib);

    event ComptrollerProxyDeployed(
        address indexed creator,
        address comptrollerProxy,
        address indexed denominationAsset,
        bytes feeManagerConfigData,
        bytes policyManagerConfigData,
        bool indexed forMigration
    );

    event NewFundCreated(
        address indexed creator,
        address comptrollerProxy,
        address vaultProxy,
        address indexed fundOwner,
        string fundName,
        address indexed denominationAsset,
        bytes feeManagerConfigData,
        bytes policyManagerConfigData
    );

    event ReleaseStatusSet(ReleaseStatus indexed prevStatus, ReleaseStatus indexed nextStatus);

    event VaultCallDeregistered(address indexed contractAddress, bytes4 selector);

    event VaultCallRegistered(address indexed contractAddress, bytes4 selector);

    // Constants
    address private immutable CREATOR;
    address private immutable DISPATCHER;
    address private immutable VAULT_LIB;

    // Pseudo-constants (can only be set once)
    address private comptrollerLib;

    // Storage
    ReleaseStatus private releaseStatus;
    mapping(address => mapping(bytes4 => bool)) private contractToSelectorToIsRegisteredVaultCall;
    mapping(address => address) private pendingComptrollerProxyToCreator;

    modifier onlyMigrator(address _vaultProxy) {
        require(
            IVault(_vaultProxy).canMigrate(msg.sender),
            "Only a permissioned migrator can call this function"
        );
        _;
    }

    modifier onlyNotPaused() {
        require(releaseStatus != ReleaseStatus.Paused, "Release is paused");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == getOwner(), "Only the contract owner can call this function");
        _;
    }

    modifier onlyPendingComptrollerProxyCreator(address _comptrollerProxy) {
        require(
            msg.sender == pendingComptrollerProxyToCreator[_comptrollerProxy],
            "Only the ComptrollerProxy creator can call this function"
        );
        _;
    }

    constructor(
        address _dispatcher,
        address _engine,
        address _vaultLib,
        address[] memory _vaultCallContracts,
        bytes4[] memory _vaultCallSelectors
    ) public AmguConsumer(_engine) {
        if (_vaultCallContracts.length > 0) {
            __registerVaultCalls(_vaultCallContracts, _vaultCallSelectors);
        }
        CREATOR = msg.sender;
        DISPATCHER = _dispatcher;
        VAULT_LIB = _vaultLib;
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Sets the comptrollerLib
    /// @param _comptrollerLib The ComptrollerLib contract address
    /// @dev Can only be set once
    function setComptrollerLib(address _comptrollerLib) external onlyOwner {
        require(
            comptrollerLib == address(0),
            "setComptrollerLib: This value can only be set once"
        );

        comptrollerLib = _comptrollerLib;

        emit ComptrollerLibSet(_comptrollerLib);
    }

    /// @notice Sets the status of the protocol to a new state
    /// @param _nextStatus The next status state to set
    function setReleaseStatus(ReleaseStatus _nextStatus) external {
        require(
            msg.sender == IDispatcher(DISPATCHER).getOwner(),
            "setReleaseStatus: Only the Dispatcher owner can call this function"
        );
        require(
            _nextStatus != ReleaseStatus.PreLaunch,
            "setReleaseStatus: Cannot return to PreLaunch status"
        );
        require(
            comptrollerLib != address(0),
            "setReleaseStatus: Can only set the release status when comptrollerLib is set"
        );

        ReleaseStatus prevStatus = releaseStatus;
        require(_nextStatus != prevStatus, "setReleaseStatus: _nextStatus is the current status");

        releaseStatus = _nextStatus;

        emit ReleaseStatusSet(prevStatus, _nextStatus);
    }

    /// @notice Gets the current owner of the contract
    /// @return owner_ The contract owner address
    /// @dev Dynamically gets the owner based on the Protocol status
    function getOwner() public view override returns (address owner_) {
        if (releaseStatus == ReleaseStatus.PreLaunch) {
            return CREATOR;
        }

        return IDispatcher(DISPATCHER).getOwner();
    }

    ///////////////////
    // FUND CREATION //
    ///////////////////

    /// @notice Creates fund config, which can be migrated to from a previous release
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    /// @return comptrollerProxy_ The address of the ComptrollerProxy deployed during this action.
    /// @dev This should only ever be used to migrate a fund. While it could technically be used
    /// to setup a fund before deploying a VaultProxy and activating it, it doesn't charge amgu.
    /// This is why there is no external function to create a vault and activate.
    function createMigratedFundConfig(
        address _denominationAsset,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external onlyNotPaused returns (address comptrollerProxy_) {
        require(
            _denominationAsset != address(0),
            "createMigratedFundConfig: _denominationAsset cannot be empty"
        );

        comptrollerProxy_ = __deployComptrollerProxy(
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData,
            true
        );

        pendingComptrollerProxyToCreator[comptrollerProxy_] = msg.sender;

        return comptrollerProxy_;
    }

    /// @notice Creates a new fund, including fund config and a fund vault
    /// @param _fundOwner The address of the owner for the fund
    /// @param _fundName The name of the fund
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    /// @return comptrollerProxy_ The address of the ComptrollerProxy deployed during this action.
    function createNewFund(
        address _fundOwner,
        string calldata _fundName,
        address _denominationAsset,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    )
        external
        payable
        onlyNotPaused
        amguPayable
        returns (address comptrollerProxy_, address vaultProxy_)
    {
        require(_fundOwner != address(0), "createNewFund: _owner cannot be empty");
        require(
            _denominationAsset != address(0),
            "createNewFund: _denominationAsset cannot be empty"
        );

        comptrollerProxy_ = __deployComptrollerProxy(
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData,
            false
        );

        vaultProxy_ = IDispatcher(DISPATCHER).deployVaultProxy(
            VAULT_LIB,
            _fundOwner,
            comptrollerProxy_,
            _fundName
        );

        IComptroller(comptrollerProxy_).activate(vaultProxy_, false);

        emit NewFundCreated(
            msg.sender,
            comptrollerProxy_,
            vaultProxy_,
            _fundOwner,
            _fundName,
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData
        );

        return (comptrollerProxy_, vaultProxy_);
    }

    /// @dev Helper function to deploy a new ComptrollerProxy
    function __deployComptrollerProxy(
        address _denominationAsset,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData,
        bool _forMigration
    ) private returns (address comptrollerProxy_) {
        bytes memory constructData = abi.encodeWithSelector(
            IComptroller.init.selector,
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData
        );
        comptrollerProxy_ = address(new ComptrollerProxy(constructData, comptrollerLib));

        emit ComptrollerProxyDeployed(
            msg.sender,
            comptrollerProxy_,
            _denominationAsset,
            _feeManagerConfigData,
            _policyManagerConfigData,
            _forMigration
        );
    }

    //////////////////
    // MIGRATION IN //
    //////////////////

    /// @notice Cancels fund migration
    /// @param _vaultProxy The VaultProxy for which to cancel migration
    function cancelMigration(address _vaultProxy) external {
        __cancelMigration(_vaultProxy, false);
    }

    /// @notice Cancels fund migration, bypassing any failures.
    /// Should be used in an emergency only.
    /// @param _vaultProxy The VaultProxy for which to cancel migration
    function cancelMigrationEmergency(address _vaultProxy) external {
        __cancelMigration(_vaultProxy, true);
    }

    /// @notice Executes fund migration
    /// @param _vaultProxy The VaultProxy for which to execute the migration
    function executeMigration(address _vaultProxy) external {
        __executeMigration(_vaultProxy, false);
    }

    /// @notice Executes fund migration, bypassing any failures.
    /// Should be used in an emergency only.
    /// @param _vaultProxy The VaultProxy for which to execute the migration
    function executeMigrationEmergency(address _vaultProxy) external {
        __executeMigration(_vaultProxy, true);
    }

    function postCancelMigrationTargetHook(
        address,
        address,
        address,
        address,
        uint256
    ) external virtual override {
        // UNIMPLEMENTED
        // TODO: add event if we have cancel migration event
    }

    /// @notice Signal a fund migration
    /// @param _vaultProxy The VaultProxy for which to signal the migration
    /// @param _comptrollerProxy The ComptrollerProxy for which to signal the migration
    function signalMigration(address _vaultProxy, address _comptrollerProxy) external {
        __signalMigration(_vaultProxy, _comptrollerProxy, false);
    }

    /// @notice Signal a fund migration, bypassing any failures.
    /// Should be used in an emergency only.
    /// @param _vaultProxy The VaultProxy for which to signal the migration
    /// @param _comptrollerProxy The ComptrollerProxy for which to signal the migration
    function signalMigrationEmergency(address _vaultProxy, address _comptrollerProxy) external {
        __signalMigration(_vaultProxy, _comptrollerProxy, true);
    }

    /// @dev Helper to cancel a migration
    function __cancelMigration(address _vaultProxy, bool _bypassFailure)
        private
        onlyNotPaused
        onlyMigrator(_vaultProxy)
    {
        IDispatcher(DISPATCHER).cancelMigration(_vaultProxy, _bypassFailure);
    }

    /// @dev Helper to execute a migration.
    /// A shutdown fund is not blocked from migration.
    function __executeMigration(address _vaultProxy, bool _bypassFailure)
        private
        onlyNotPaused
        onlyMigrator(_vaultProxy)
    {
        IDispatcher dispatcherContract = IDispatcher(DISPATCHER);

        (, address comptrollerProxy, , ) = dispatcherContract
            .getMigrationRequestDetailsForVaultProxy(_vaultProxy);

        // TODO: should executeMigration return values like comptrollerProxy?
        dispatcherContract.executeMigration(_vaultProxy, _bypassFailure);

        IComptroller(comptrollerProxy).activate(_vaultProxy, true);

        delete pendingComptrollerProxyToCreator[comptrollerProxy];
    }

    /// @dev Helper to signal a migration
    /// A shutdown fund is not blocked from migration.
    function __signalMigration(
        address _vaultProxy,
        address _comptrollerProxy,
        bool _bypassFailure
    )
        private
        onlyNotPaused
        onlyPendingComptrollerProxyCreator(_comptrollerProxy)
        onlyMigrator(_vaultProxy)
    {
        IDispatcher(DISPATCHER).signalMigration(
            _vaultProxy,
            _comptrollerProxy,
            VAULT_LIB,
            _bypassFailure
        );
    }

    ///////////////////
    // MIGRATION OUT //
    ///////////////////

    function postCancelMigrationOriginHook(
        address,
        address,
        address,
        address,
        uint256
    ) external virtual override {
        // UNIMPLEMENTED
    }

    /// @notice Runs arbitrary logic immediately prior to executing a migration
    /// @param _vaultProxy The VaultProxy being migrated
    /// @dev Must use pre-migration hook to be able to get the ComptrollerProxy (prevAccessor)
    // TODO: Update hooks to include prev accessor?
    // TODO: Include un-paused only here?
    function preMigrateOriginHook(
        address _vaultProxy,
        address,
        address,
        address,
        uint256
    ) external override {
        require(
            msg.sender == DISPATCHER,
            "postMigrateOriginHook: Only Dispatcher can call this function"
        );

        // Wind down fund and destroy its config
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();
        IComptroller(comptrollerProxy).destruct();
    }

    function postMigrateOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function preSignalMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function postSignalMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib
    ) external virtual override {
        // UNIMPLEMENTED
    }

    //////////////
    // REGISTRY //
    //////////////

    /// @notice De-registers allowed arbitrary vault calls
    /// @param _contracts The contracts of the calls to de-register
    /// @param _selectors The selectors of the calls to de-register
    function deregisterVaultCalls(address[] calldata _contracts, bytes4[] calldata _selectors)
        external
        onlyOwner
    {
        require(_contracts.length > 0, "deregisterVaultCalls: no contracts input");
        require(
            _contracts.length == _selectors.length,
            "deregisterVaultCalls: uneven input arrays"
        );

        for (uint256 i; i < _contracts.length; i++) {
            require(
                contractToSelectorToIsRegisteredVaultCall[_contracts[i]][_selectors[i]],
                "deregisterVaultCalls: contract + selector pair not registered"
            );

            contractToSelectorToIsRegisteredVaultCall[_contracts[i]][_selectors[i]] = false;

            emit VaultCallDeregistered(_contracts[i], _selectors[i]);
        }
    }

    /// @notice Registers allowed arbitrary vault calls
    /// @param _contracts The contracts of the calls to register
    /// @param _selectors The selectors of the calls to register
    function registerVaultCalls(address[] calldata _contracts, bytes4[] calldata _selectors)
        external
        onlyOwner
    {
        require(_contracts.length > 0, "registerVaultCalls: no contracts input");

        __registerVaultCalls(_contracts, _selectors);
    }

    /// @dev Helper to register allowed vault calls
    function __registerVaultCalls(address[] memory _contracts, bytes4[] memory _selectors)
        private
    {
        require(
            _contracts.length == _selectors.length,
            "__registerVaultCalls: uneven input arrays"
        );

        for (uint256 i; i < _contracts.length; i++) {
            require(
                !contractToSelectorToIsRegisteredVaultCall[_contracts[i]][_selectors[i]],
                "__registerVaultCalls: contract + selector pair already registered"
            );

            contractToSelectorToIsRegisteredVaultCall[_contracts[i]][_selectors[i]] = true;

            emit VaultCallRegistered(_contracts[i], _selectors[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `comptrollerLib` variable value
    /// @return comptrollerLib_ The `comptrollerLib` variable value
    function getComptrollerLib() external view returns (address comptrollerLib_) {
        return comptrollerLib;
    }

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

    /// @notice Gets the creator of a pending ComptrollerProxy
    /// @return pendingComptrollerProxyCreator_ The pending ComptrollerProxy creator
    function getPendingComptrollerProxyCreator(address _comptrollerProxy)
        external
        view
        returns (address pendingComptrollerProxyCreator_)
    {
        return pendingComptrollerProxyToCreator[_comptrollerProxy];
    }

    /// @notice Gets the `releaseStatus` variable value
    /// @return status_ The `releaseStatus` variable value
    function getReleaseStatus() external view override returns (ReleaseStatus status_) {
        return releaseStatus;
    }

    /// @notice Gets the `VAULT_LIB` variable value
    /// @return vaultLib_ The `VAULT_LIB` variable value
    function getVaultLib() external view returns (address vaultLib_) {
        return VAULT_LIB;
    }

    /// @notice Checks if a contract call is registered
    /// @param _contract The contract of the call to check
    /// @param _selector The selector of the call to check
    /// @return isRegistered_ True if the call is registered
    function isRegisteredVaultCall(address _contract, bytes4 _selector)
        external
        view
        override
        returns (bool isRegistered_)
    {
        return contractToSelectorToIsRegisteredVaultCall[_contract][_selector];
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IDispatcher} from "../../../persistent/dispatcher/IDispatcher.sol";
import {IMigrationHookHandler} from "../../../persistent/dispatcher/IMigrationHookHandler.sol";
import {IExtension} from "../../extensions/IExtension.sol";
import {GasRelayRecipientMixin} from "../../infrastructure/gas-relayer/GasRelayRecipientMixin.sol";
import {IProtocolFeeTracker} from "../../infrastructure/protocol-fees/IProtocolFeeTracker.sol";
import {ComptrollerProxy} from "../fund/comptroller/ComptrollerProxy.sol";
import {IComptroller} from "../fund/comptroller/IComptroller.sol";
import {IVault} from "../fund/vault/IVault.sol";
import {IFundDeployer} from "./IFundDeployer.sol";

/// @title FundDeployer Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice The top-level contract of the release.
/// It primarily coordinates fund deployment and fund migration, but
/// it is also deferred to for contract access control and for allowed calls
/// that can be made with a fund's VaultProxy as the msg.sender.
contract FundDeployer is IFundDeployer, IMigrationHookHandler, GasRelayRecipientMixin {
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

    // Constants
    // keccak256(abi.encodePacked("mln.vaultCall.any")
    bytes32 private constant ANY_VAULT_CALL = 0x5bf1898dd28c4d29f33c4c1bb9b8a7e2f6322847d70be63e8f89de024d08a669;

    address private immutable CREATOR;
    address private immutable DISPATCHER;

    // Pseudo-constants (can only be set once)
    address private comptrollerLib;
    address private protocolFeeTracker;
    address private vaultLib;

    // Storage
    uint32 private gasLimitForDestructCallToDeactivateFeeManager; // Can reduce to uint16
    uint32 private gasLimitForDestructCallToPayProtocolFee; // Can reduce to uint16
    bool private isLive;
    uint256 private reconfigurationTimelock;

    mapping(address => bool) private acctToIsAllowedBuySharesOnBehalfCaller;
    mapping(bytes32 => mapping(bytes32 => bool)) private vaultCallToPayloadToIsAllowed;
    mapping(address => ReconfigurationRequest) private vaultProxyToReconfigurationRequest;

    modifier onlyDispatcher() {
        require(msg.sender == DISPATCHER, "Only Dispatcher can call this function");
        _;
    }

    modifier onlyLiveRelease() {
        require(releaseIsLive(), "Release is not yet live");
        _;
    }

    modifier onlyMigrator(address _vaultProxy) {
        __assertIsMigrator(_vaultProxy, __msgSender());
        _;
    }

    modifier onlyMigratorNotRelayable(address _vaultProxy) {
        __assertIsMigrator(_vaultProxy, msg.sender);
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

    function __assertIsMigrator(address _vaultProxy, address _who) private view {
        require(IVault(_vaultProxy).canMigrate(_who), "Only a permissioned migrator can call this function");
    }

    constructor(address _dispatcher, address _gasRelayPaymasterFactory)
        public
        GasRelayRecipientMixin(_gasRelayPaymasterFactory)
    {
        // Validate constants
        require(
            ANY_VAULT_CALL == keccak256(abi.encodePacked("mln.vaultCall.any")), "constructor: Incorrect ANY_VAULT_CALL"
        );

        CREATOR = msg.sender;
        DISPATCHER = _dispatcher;

        // Estimated base call cost: 17k
        // Per fee that uses shares outstanding (default recipient): 33k
        // 300k accommodates up to 8 such fees
        gasLimitForDestructCallToDeactivateFeeManager = 300000;
        // Estimated cost: 50k
        gasLimitForDestructCallToPayProtocolFee = 200000;

        reconfigurationTimelock = 2 days;
    }

    //////////////////////////////////////
    // PSEUDO-CONSTANTS (only set once) //
    //////////////////////////////////////

    /// @notice Sets the ComptrollerLib
    /// @param _comptrollerLib The ComptrollerLib contract address
    function setComptrollerLib(address _comptrollerLib) external onlyOwner pseudoConstant(getComptrollerLib()) {
        comptrollerLib = _comptrollerLib;

        emit ComptrollerLibSet(_comptrollerLib);
    }

    /// @notice Sets the ProtocolFeeTracker
    /// @param _protocolFeeTracker The ProtocolFeeTracker contract address
    function setProtocolFeeTracker(address _protocolFeeTracker)
        external
        onlyOwner
        pseudoConstant(getProtocolFeeTracker())
    {
        protocolFeeTracker = _protocolFeeTracker;

        emit ProtocolFeeTrackerSet(_protocolFeeTracker);
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

    /// @notice Gets the current owner of the contract
    /// @return owner_ The contract owner address
    /// @dev The owner is initially the contract's creator, for convenience in setting up configuration.
    /// Ownership is handed-off when the creator calls setReleaseLive().
    function getOwner() public view override returns (address owner_) {
        if (!releaseIsLive()) {
            return getCreator();
        }

        return IDispatcher(getDispatcher()).getOwner();
    }

    /// @notice Sets the amounts of gas to forward to each of the ComptrollerLib.destructActivated() external calls
    /// @param _nextDeactivateFeeManagerGasLimit The amount of gas to forward to deactivate the FeeManager
    /// @param _nextPayProtocolFeeGasLimit The amount of gas to forward to pay the protocol fee
    function setGasLimitsForDestructCall(uint32 _nextDeactivateFeeManagerGasLimit, uint32 _nextPayProtocolFeeGasLimit)
        external
        onlyOwner
    {
        require(
            _nextDeactivateFeeManagerGasLimit > 0 && _nextPayProtocolFeeGasLimit > 0,
            "setGasLimitsForDestructCall: Zero value not allowed"
        );

        gasLimitForDestructCallToDeactivateFeeManager = _nextDeactivateFeeManagerGasLimit;
        gasLimitForDestructCallToPayProtocolFee = _nextPayProtocolFeeGasLimit;

        emit GasLimitsForDestructCallSet(_nextDeactivateFeeManagerGasLimit, _nextPayProtocolFeeGasLimit);
    }

    /// @notice Sets the release as live
    /// @dev A live release allows funds to be created and migrated once this contract
    /// is set as the Dispatcher.currentFundDeployer
    function setReleaseLive() external {
        require(msg.sender == getCreator(), "setReleaseLive: Only the creator can call this function");
        require(!releaseIsLive(), "setReleaseLive: Already live");

        // All pseudo-constants should be set
        require(getComptrollerLib() != address(0), "setReleaseLive: comptrollerLib is not set");
        require(getProtocolFeeTracker() != address(0), "setReleaseLive: protocolFeeTracker is not set");
        require(getVaultLib() != address(0), "setReleaseLive: vaultLib is not set");

        isLive = true;

        emit ReleaseIsLive();
    }

    /// @dev Helper to call ComptrollerProxy.destructActivated() with the correct params
    function __destructActivatedComptrollerProxy(address _comptrollerProxy) private {
        (uint256 deactivateFeeManagerGasLimit, uint256 payProtocolFeeGasLimit) = getGasLimitsForDestructCall();
        IComptroller(_comptrollerProxy).destructActivated(deactivateFeeManagerGasLimit, payProtocolFeeGasLimit);
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
    ) external onlyLiveRelease onlyMigratorNotRelayable(_vaultProxy) returns (address comptrollerProxy_) {
        // Bad _vaultProxy value is validated by Dispatcher.signalMigration()

        require(
            !IDispatcher(getDispatcher()).hasMigrationRequest(_vaultProxy),
            "createMigrationRequest: A MigrationRequest already exists"
        );

        comptrollerProxy_ = __deployComptrollerProxy(msg.sender, _denominationAsset, _sharesActionTimelock);

        IComptroller(comptrollerProxy_).setVaultProxy(_vaultProxy);

        __configureExtensions(comptrollerProxy_, _vaultProxy, _feeManagerConfigData, _policyManagerConfigData);

        IDispatcher(getDispatcher()).signalMigration(
            _vaultProxy, comptrollerProxy_, getVaultLib(), _bypassPrevReleaseFailure
        );

        emit MigrationRequestCreated(msg.sender, _vaultProxy, comptrollerProxy_);

        return comptrollerProxy_;
    }

    /// @notice Creates a new fund
    /// @param _fundOwner The address of the owner for the fund
    /// @param _fundName The name of the fund's shares token
    /// @param _fundSymbol The symbol of the fund's shares token
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    /// @return comptrollerProxy_ The address of the ComptrollerProxy deployed during this action
    function createNewFund(
        address _fundOwner,
        string calldata _fundName,
        string calldata _fundSymbol,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external onlyLiveRelease returns (address comptrollerProxy_, address vaultProxy_) {
        // _fundOwner is validated by VaultLib.__setOwner()
        address canonicalSender = __msgSender();

        comptrollerProxy_ = __deployComptrollerProxy(canonicalSender, _denominationAsset, _sharesActionTimelock);

        vaultProxy_ = __deployVaultProxy(_fundOwner, comptrollerProxy_, _fundName, _fundSymbol);

        IComptroller comptrollerContract = IComptroller(comptrollerProxy_);
        comptrollerContract.setVaultProxy(vaultProxy_);

        __configureExtensions(comptrollerProxy_, vaultProxy_, _feeManagerConfigData, _policyManagerConfigData);

        comptrollerContract.activate(false);

        IProtocolFeeTracker(getProtocolFeeTracker()).initializeForVault(vaultProxy_);

        emit NewFundCreated(canonicalSender, vaultProxy_, comptrollerProxy_);

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
    ) external override returns (address comptrollerProxy_) {
        address canonicalSender = __msgSender();
        __assertIsMigrator(_vaultProxy, canonicalSender);
        require(
            IDispatcher(getDispatcher()).getFundDeployerForVaultProxy(_vaultProxy) == address(this),
            "createReconfigurationRequest: VaultProxy not on this release"
        );
        require(
            !hasReconfigurationRequest(_vaultProxy),
            "createReconfigurationRequest: VaultProxy has a pending reconfiguration request"
        );

        comptrollerProxy_ = __deployComptrollerProxy(canonicalSender, _denominationAsset, _sharesActionTimelock);

        IComptroller(comptrollerProxy_).setVaultProxy(_vaultProxy);

        __configureExtensions(comptrollerProxy_, _vaultProxy, _feeManagerConfigData, _policyManagerConfigData);

        uint256 executableTimestamp = block.timestamp + getReconfigurationTimelock();
        vaultProxyToReconfigurationRequest[_vaultProxy] =
            ReconfigurationRequest({nextComptrollerProxy: comptrollerProxy_, executableTimestamp: executableTimestamp});

        emit ReconfigurationRequestCreated(canonicalSender, _vaultProxy, comptrollerProxy_, executableTimestamp);

        return comptrollerProxy_;
    }

    /// @dev Helper function to configure the Extensions for a given ComptrollerProxy
    function __configureExtensions(
        address _comptrollerProxy,
        address _vaultProxy,
        bytes memory _feeManagerConfigData,
        bytes memory _policyManagerConfigData
    ) private {
        // Since fees can only be set in this step, if there are no fees, there is no need to set the validated VaultProxy
        if (_feeManagerConfigData.length > 0) {
            IExtension(IComptroller(_comptrollerProxy).getFeeManager()).setConfigForFund(
                _comptrollerProxy, _vaultProxy, _feeManagerConfigData
            );
        }

        // For all other extensions, we call to cache the validated VaultProxy, for simplicity.
        // In the future, we can consider caching conditionally.
        IExtension(IComptroller(_comptrollerProxy).getExternalPositionManager()).setConfigForFund(
            _comptrollerProxy, _vaultProxy, ""
        );
        IExtension(IComptroller(_comptrollerProxy).getIntegrationManager()).setConfigForFund(
            _comptrollerProxy, _vaultProxy, ""
        );
        IExtension(IComptroller(_comptrollerProxy).getPolicyManager()).setConfigForFund(
            _comptrollerProxy, _vaultProxy, _policyManagerConfigData
        );
    }

    /// @dev Helper function to deploy a configured ComptrollerProxy
    function __deployComptrollerProxy(
        address _canonicalSender,
        address _denominationAsset,
        uint256 _sharesActionTimelock
    ) private returns (address comptrollerProxy_) {
        // _denominationAsset is validated by ComptrollerLib.init()

        bytes memory constructData =
            abi.encodeWithSelector(IComptroller.init.selector, _denominationAsset, _sharesActionTimelock);
        comptrollerProxy_ = address(new ComptrollerProxy(constructData, getComptrollerLib()));

        emit ComptrollerProxyDeployed(_canonicalSender, comptrollerProxy_, _denominationAsset, _sharesActionTimelock);

        return comptrollerProxy_;
    }

    /// @dev Helper to deploy a new VaultProxy instance during fund creation.
    /// Avoids stack-too-deep error.
    function __deployVaultProxy(
        address _fundOwner,
        address _comptrollerProxy,
        string calldata _fundName,
        string calldata _fundSymbol
    ) private returns (address vaultProxy_) {
        vaultProxy_ =
            IDispatcher(getDispatcher()).deployVaultProxy(getVaultLib(), _fundOwner, _comptrollerProxy, _fundName);
        if (bytes(_fundSymbol).length != 0) {
            IVault(vaultProxy_).setSymbol(_fundSymbol);
        }

        return vaultProxy_;
    }

    ///////////////////////////////////////////////
    // RECONFIGURATION (INTRA-RELEASE MIGRATION) //
    ///////////////////////////////////////////////

    /// @notice Cancels a pending reconfiguration request
    /// @param _vaultProxy The VaultProxy contract for which to cancel the reconfiguration request
    function cancelReconfiguration(address _vaultProxy) external override onlyMigrator(_vaultProxy) {
        address nextComptrollerProxy = vaultProxyToReconfigurationRequest[_vaultProxy].nextComptrollerProxy;
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
    /// @dev ProtocolFeeTracker.initializeForVault() does not need to be included in a reconfiguration,
    /// as it refers to the vault and not the new ComptrollerProxy
    function executeReconfiguration(address _vaultProxy) external override onlyMigrator(_vaultProxy) {
        ReconfigurationRequest memory request = getReconfigurationRequestForVaultProxy(_vaultProxy);
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
            IDispatcher(getDispatcher()).getFundDeployerForVaultProxy(_vaultProxy) == address(this),
            "executeReconfiguration: _vaultProxy is no longer on this release"
        );

        // Unwind and destroy the prevComptrollerProxy before setting the nextComptrollerProxy as the VaultProxy.accessor
        address prevComptrollerProxy = IVault(_vaultProxy).getAccessor();
        address paymaster = IComptroller(prevComptrollerProxy).getGasRelayPaymaster();
        __destructActivatedComptrollerProxy(prevComptrollerProxy);

        // Execute the reconfiguration
        IVault(_vaultProxy).setAccessorForFundReconfiguration(request.nextComptrollerProxy);

        // Activate the new ComptrollerProxy
        IComptroller(request.nextComptrollerProxy).activate(true);
        if (paymaster != address(0)) {
            IComptroller(request.nextComptrollerProxy).setGasRelayPaymaster(paymaster);
        }

        // Remove the reconfiguration request
        delete vaultProxyToReconfigurationRequest[_vaultProxy];

        emit ReconfigurationRequestExecuted(_vaultProxy, prevComptrollerProxy, request.nextComptrollerProxy);
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
        onlyMigratorNotRelayable(_vaultProxy)
    {
        IDispatcher(getDispatcher()).cancelMigration(_vaultProxy, _bypassPrevReleaseFailure);
    }

    /// @notice Executes fund migration
    /// @param _vaultProxy The VaultProxy for which to execute the migration
    /// @param _bypassPrevReleaseFailure True if should override a failure in the previous release while executing migration
    function executeMigration(address _vaultProxy, bool _bypassPrevReleaseFailure)
        external
        onlyMigratorNotRelayable(_vaultProxy)
    {
        IDispatcher dispatcherContract = IDispatcher(getDispatcher());

        (, address comptrollerProxy,,) = dispatcherContract.getMigrationRequestDetailsForVaultProxy(_vaultProxy);

        dispatcherContract.executeMigration(_vaultProxy, _bypassPrevReleaseFailure);

        IComptroller(comptrollerProxy).activate(true);

        IProtocolFeeTracker(getProtocolFeeTracker()).initializeForVault(_vaultProxy);
    }

    /// @notice Executes logic when a migration is canceled on the Dispatcher
    /// @param _nextComptrollerProxy The ComptrollerProxy created on this release
    function invokeMigrationInCancelHook(address, address, address _nextComptrollerProxy, address)
        external
        override
        onlyDispatcher
    {
        IComptroller(_nextComptrollerProxy).destructUnactivated();
    }

    ///////////////////
    // MIGRATION OUT //
    ///////////////////

    /// @notice Allows "hooking into" specific moments in the migration pipeline
    /// to execute arbitrary logic during a migration out of this release
    /// @param _vaultProxy The VaultProxy being migrated
    function invokeMigrationOutHook(MigrationOutHook _hook, address _vaultProxy, address, address, address)
        external
        override
        onlyDispatcher
    {
        if (_hook != MigrationOutHook.PreMigrate) {
            return;
        }

        // Must use PreMigrate hook to get the ComptrollerProxy from the VaultProxy
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();

        // Wind down fund and destroy its config
        __destructActivatedComptrollerProxy(comptrollerProxy);
    }

    //////////////
    // REGISTRY //
    //////////////

    // BUY SHARES CALLERS

    /// @notice Deregisters allowed callers of ComptrollerProxy.buySharesOnBehalf()
    /// @param _callers The callers to deregister
    function deregisterBuySharesOnBehalfCallers(address[] calldata _callers) external onlyOwner {
        for (uint256 i; i < _callers.length; i++) {
            require(
                isAllowedBuySharesOnBehalfCaller(_callers[i]),
                "deregisterBuySharesOnBehalfCallers: Caller not registered"
            );

            acctToIsAllowedBuySharesOnBehalfCaller[_callers[i]] = false;

            emit BuySharesOnBehalfCallerDeregistered(_callers[i]);
        }
    }

    /// @notice Registers allowed callers of ComptrollerProxy.buySharesOnBehalf()
    /// @param _callers The allowed callers
    /// @dev Validate that each registered caller only forwards requests to buy shares that
    /// originate from the same _buyer passed into buySharesOnBehalf(). This is critical
    /// to the integrity of VaultProxy.freelyTransferableShares.
    function registerBuySharesOnBehalfCallers(address[] calldata _callers) external onlyOwner {
        for (uint256 i; i < _callers.length; i++) {
            require(
                !isAllowedBuySharesOnBehalfCaller(_callers[i]),
                "registerBuySharesOnBehalfCallers: Caller already registered"
            );

            acctToIsAllowedBuySharesOnBehalfCaller[_callers[i]] = true;

            emit BuySharesOnBehalfCallerRegistered(_callers[i]);
        }
    }

    // VAULT CALLS

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

            vaultCallToPayloadToIsAllowed[keccak256(abi.encodePacked(_contracts[i], _selectors[i]))][_dataHashes[i]] =
                false;

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

            vaultCallToPayloadToIsAllowed[keccak256(abi.encodePacked(_contracts[i], _selectors[i]))][_dataHashes[i]] =
                true;

            emit VaultCallRegistered(_contracts[i], _selectors[i], _dataHashes[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Checks if a contract call is allowed
    /// @param _contract The contract of the call to check
    /// @param _selector The selector of the call to check
    /// @param _dataHash The keccak call data hash of the call to check
    /// @return isAllowed_ True if the call is allowed
    /// @dev A vault call is allowed if the _dataHash is specifically allowed,
    /// or if any _dataHash is allowed
    function isAllowedVaultCall(address _contract, bytes4 _selector, bytes32 _dataHash)
        external
        view
        override
        returns (bool isAllowed_)
    {
        bytes32 contractFunctionHash = keccak256(abi.encodePacked(_contract, _selector));

        return vaultCallToPayloadToIsAllowed[contractFunctionHash][_dataHash]
            || vaultCallToPayloadToIsAllowed[contractFunctionHash][ANY_VAULT_CALL];
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the `comptrollerLib` variable value
    /// @return comptrollerLib_ The `comptrollerLib` variable value
    function getComptrollerLib() public view returns (address comptrollerLib_) {
        return comptrollerLib;
    }

    /// @notice Gets the `CREATOR` variable value
    /// @return creator_ The `CREATOR` variable value
    function getCreator() public view returns (address creator_) {
        return CREATOR;
    }

    /// @notice Gets the `DISPATCHER` variable value
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() public view returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the amounts of gas to forward to each of the ComptrollerLib.destructActivated() external calls
    /// @return deactivateFeeManagerGasLimit_ The amount of gas to forward to deactivate the FeeManager
    /// @return payProtocolFeeGasLimit_ The amount of gas to forward to pay the protocol fee
    function getGasLimitsForDestructCall()
        public
        view
        returns (uint256 deactivateFeeManagerGasLimit_, uint256 payProtocolFeeGasLimit_)
    {
        return (gasLimitForDestructCallToDeactivateFeeManager, gasLimitForDestructCallToPayProtocolFee);
    }

    /// @notice Gets the `protocolFeeTracker` variable value
    /// @return protocolFeeTracker_ The `protocolFeeTracker` variable value
    function getProtocolFeeTracker() public view returns (address protocolFeeTracker_) {
        return protocolFeeTracker;
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

    /// @notice Checks if an account is an allowed caller of ComptrollerProxy.buySharesOnBehalf()
    /// @param _who The account to check
    /// @return isAllowed_ True if the account is an allowed caller
    function isAllowedBuySharesOnBehalfCaller(address _who) public view override returns (bool isAllowed_) {
        return acctToIsAllowedBuySharesOnBehalfCaller[_who];
    }

    /// @notice Checks if a contract call is registered
    /// @param _contract The contract of the call to check
    /// @param _selector The selector of the call to check
    /// @param _dataHash The keccak call data hash of the call to check
    /// @return isRegistered_ True if the call is registered
    function isRegisteredVaultCall(address _contract, bytes4 _selector, bytes32 _dataHash)
        public
        view
        returns (bool isRegistered_)
    {
        return vaultCallToPayloadToIsAllowed[keccak256(abi.encodePacked(_contract, _selector))][_dataHash];
    }

    /// @notice Gets the `isLive` variable value
    /// @return isLive_ The `isLive` variable value
    function releaseIsLive() public view returns (bool isLive_) {
        return isLive;
    }
}

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

    event ComptrollerProxyDeployed(address deployer, address comptrollerProxy);

    event NewFundDeployed(
        address caller,
        address comptrollerProxy,
        address vaultProxy,
        address indexed fundOwner,
        string fundName,
        address indexed denominationAsset,
        bytes feeManagerConfig,
        bytes policyManagerConfig
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

    modifier onlyOwner() {
        require(msg.sender == getOwner(), "Only the contract owner can call this function");
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

    //////////
    // CORE //
    //////////

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
    function getOwner() public override view returns (address owner_) {
        if (releaseStatus == ReleaseStatus.PreLaunch) {
            return CREATOR;
        }

        return IDispatcher(DISPATCHER).getOwner();
    }

    /////////////////////
    // FUND DEPLOYMENT //
    /////////////////////

    function createNewFund(
        address _fundOwner,
        string calldata _fundName,
        address _denominationAsset,
        bytes calldata _feeManagerConfig,
        bytes calldata _policyManagerConfig
    ) external payable amguPayable returns (address comptrollerProxy_, address vaultProxy_) {
        require(_fundOwner != address(0), "createNewFund: _owner cannot be empty");

        // 1. Deploy ComptrollerProxy
        comptrollerProxy_ = __deployComptrollerProxy();

        // 2. Deploy VaultProxy
        vaultProxy_ = IDispatcher(DISPATCHER).deployVaultProxy(
            VAULT_LIB,
            _fundOwner,
            comptrollerProxy_,
            _fundName
        );

        // 3. Set config, set vaultProxy, and activate fund
        IComptroller(comptrollerProxy_).quickSetup(
            vaultProxy_,
            _denominationAsset,
            _feeManagerConfig,
            _policyManagerConfig
        );

        emit NewFundDeployed(
            msg.sender,
            comptrollerProxy_,
            vaultProxy_,
            _fundOwner,
            _fundName,
            _denominationAsset,
            _feeManagerConfig,
            _policyManagerConfig
        );
    }

    function __deployComptrollerProxy() private returns (address comptrollerProxy_) {
        bytes memory constructData = abi.encodeWithSelector(IComptroller.init.selector, "");
        comptrollerProxy_ = address(new ComptrollerProxy(constructData, comptrollerLib));

        emit ComptrollerProxyDeployed(msg.sender, comptrollerProxy_);
    }

    ////////////////////
    // FUND MIGRATION //
    ////////////////////

    function postCancelMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function postCancelMigrationTargetHook(
        address _vaultProxy,
        address _prevRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    /// @dev Must use pre-migration hook to be able to know the ComptrollerProxy (prev accessor)
    // TODO: need to update hooks to include prev accessor?
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

        // Shutdown the fund
        address comptrollerProxy = IVault(_vaultProxy).getAccessor();
        IComptroller(comptrollerProxy).shutdown();

        // TODO: self-destruct ComptrollerProxy?

        // TODO: need event?
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

    function registerVaultCalls(address[] calldata _contracts, bytes4[] calldata _selectors)
        external
        onlyOwner
    {
        require(_contracts.length > 0, "registerVaultCalls: no contracts input");

        __registerVaultCalls(_contracts, _selectors);
    }

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

    function getComptrollerLib() external view returns (address) {
        return comptrollerLib;
    }

    function getCreator() external view returns (address) {
        return CREATOR;
    }

    function getDispatcher() external view returns (address) {
        return DISPATCHER;
    }

    function getReleaseStatus() external view returns (ReleaseStatus status_) {
        return releaseStatus;
    }

    function getVaultLib() external view returns (address) {
        return VAULT_LIB;
    }

    function isRegisteredVaultCall(address _contract, bytes4 _selector)
        external
        override
        view
        returns (bool)
    {
        return contractToSelectorToIsRegisteredVaultCall[_contract][_selector];
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@melonproject/persistent/contracts/dispatcher/IDispatcher.sol";
import "../../infrastructure/engine/AmguConsumer.sol";
import "../fund/comptroller/IComptroller.sol";
import "../fund/comptroller/ComptrollerProxy.sol";
import "../fund/vault/IVault.sol";
import "./utils/MelonCouncilOwnable.sol";
import "./utils/MigrationHookHandlerMixin.sol";
import "./IFundDeployer.sol";

/// @title FundDeployer Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract of a Melon Protocol release that
/// coordinates fund deployment and fund migration. It serves as the top-level contract
/// for a release, and is thus also deferred to for contract ownership access control.
contract FundDeployer is
    IFundDeployer,
    MigrationHookHandlerMixin,
    MelonCouncilOwnable,
    AmguConsumer
{
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

    event VaultCallDeregistered(address indexed contractAddress, bytes4 selector);

    event VaultCallRegistered(address indexed contractAddress, bytes4 selector);

    // Constants
    address private immutable DISPATCHER;
    address private immutable VAULT_LIB;

    // Pseudo-constants (can only be set once)
    address private comptrollerLib;

    // Storage
    mapping(address => mapping(bytes4 => bool)) private contractToSelectorToIsRegisteredVaultCall;

    constructor(
        address _dispatcher,
        address _engine,
        address _vaultLib,
        address _mtc,
        address[] memory _vaultCallContracts,
        bytes4[] memory _vaultCallSelectors
    ) public AmguConsumer(_engine) MelonCouncilOwnable(_mtc) {
        if (_vaultCallContracts.length > 0) {
            __registerVaultCalls(_vaultCallContracts, _vaultCallSelectors);
        }
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

    // TODO: do we want to do something when a migration is signaled, or only when it is executed?
    /// @dev Must use pre-migration hook to be able to know the ComptrollerProxy (prev accessor)
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

    function __deployComptrollerProxy() private returns (address comptrollerProxy_) {
        bytes memory constructData = abi.encodeWithSelector(IComptroller.init.selector, "");
        comptrollerProxy_ = address(new ComptrollerProxy(constructData, comptrollerLib));

        emit ComptrollerProxyDeployed(msg.sender, comptrollerProxy_);
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

    function getDispatcher() external view returns (address) {
        return DISPATCHER;
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

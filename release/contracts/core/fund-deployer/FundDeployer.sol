// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/persistent/contracts/dispatcher/IDispatcher.sol";
import "../../infrastructure/engine/AmguConsumer.sol";
import "../fund/comptroller/IComptroller.sol";
import "../fund/comptroller/ComptrollerProxy.sol";
import "./utils/MelonCouncilOwnable.sol";
import "./utils/MigrationHookHandlerMixin.sol";

/// @title FundDeployer Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract of a Melon Protocol release that
/// coordinates fund deployment and fund migration. It serves as the top-level contract
/// for a release, and is thus also deferred to for contract ownership access control.
contract FundDeployer is MigrationHookHandlerMixin, MelonCouncilOwnable, AmguConsumer {
    event ComptrollerProxyDeployed(address comptrollerProxy, address indexed fundOwner);

    event NewFundDeployed(
        address comptrollerProxy,
        address vaultProxy,
        address indexed fundOwner,
        string fundName,
        address indexed denominationAsset,
        bytes feeManagerConfig,
        bytes policyManagerConfig
    );

    // Constants
    address private immutable DISPATCHER;
    address private immutable VAULT_LIB;

    // Pseudo-constants (can only be set once)
    address private comptrollerLib;

    constructor(
        address _dispatcher,
        address _engine,
        address _vaultLib,
        address _mtc
    ) public AmguConsumer(_engine) MelonCouncilOwnable(_mtc) {
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
        comptrollerProxy_ = __deployComptrollerProxy(_fundOwner);

        // 2. Deploy VaultProxy
        vaultProxy_ = IDispatcher(DISPATCHER).deployVaultProxy(
            VAULT_LIB,
            _fundOwner,
            comptrollerProxy_,
            _fundName
        );

        // 3. Set config via ComptrollerProxy and activate fund
        IComptroller(comptrollerProxy_).setFundConfigAndActivate(
            vaultProxy_,
            _denominationAsset,
            _feeManagerConfig,
            _policyManagerConfig
        );

        emit NewFundDeployed(
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
    function postMigrateOriginHook(
        address,
        address,
        address,
        address,
        uint256
    ) external override {
        require(
            msg.sender == DISPATCHER,
            "postMigrateOriginHook: Only Dispatcher can call this function"
        );
        // TODO: call out to fee manager to pay out all shares... could also be to shutdown the whole fund / delete state
        // IFeeManager.shutdown(_vaultProxy);
    }

    function __deployComptrollerProxy(address _fundOwner)
        private
        returns (address comptrollerProxy_)
    {
        // Deploy ComptrollerProxy
        bytes memory constructData = abi.encodeWithSelector(
            IComptroller.init.selector,
            _fundOwner
        );
        comptrollerProxy_ = address(new ComptrollerProxy(constructData, comptrollerLib));

        emit ComptrollerProxyDeployed(comptrollerProxy_, _fundOwner);
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
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../vault/IProxiableVault.sol";
import "../vault/VaultProxy.sol";
import "./IMigrationHookHandler.sol";
import "./IDispatcher.sol";

/// @title Dispatcher Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract linking multiple releases of Melon infrastructure,
/// regulating the deployment of new VaultProxy instances and the migration of funds between releases.
contract Dispatcher is IDispatcher {
    // TODO: Confirm whether low level calls to non-existent functions succeed or fail (and especially that they fail silently)

    // Events

    // TODO: Go through events one-by-one
    event CurrentFundDeployerSet(address prevFundDeployer, address nextFundDeployer);

    event MigrationCancelled(
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event MigrationExecuted(
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event MigrationSignaled(
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib
    );

    event PostCancelMigrationOriginHookFailed(
        bytes failureReturnData,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PostCancelMigrationTargetHookFailed(
        bytes failureReturnData,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PreMigrateOriginHookFailed(
        bytes failureReturnData,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PostMigrateOriginHookFailed(
        bytes failureReturnData,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PreSignalMigrationOriginHookFailed(
        bytes failureReturnData,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib
    );

    event PostSignalMigrationOriginHookFailed(
        bytes failureReturnData,
        address indexed vaultProxy,
        address indexed prevFundDeployer,
        address indexed nextFundDeployer,
        address nextVaultAccessor,
        address nextVaultLib
    );

    event VaultProxyDeployed(
        address indexed fundDeployer,
        address indexed owner,
        address vaultProxy,
        address vaultLib,
        address vaultAccessor,
        string fundName
    );

    struct MigrationRequest {
        address nextFundDeployer;
        address nextVaultAccessor;
        address nextVaultLib;
        uint256 signalTimestamp;
    }

    // Constants
    address internal immutable MGM;
    address internal immutable MTC;

    // FundDeployer
    address internal currentFundDeployer;

    // VaultProxies
    // TODO: do we want an ownerToVaultProxies array?
    mapping(address => address) internal vaultProxyToFundDeployer;
    mapping(address => MigrationRequest) internal vaultProxyToMigrationRequest;

    modifier onlyMTC() {
        require(msg.sender == MTC, "Only MTC can call this function");
        _;
    }

    modifier onlyCurrentFundDeployer() {
        require(
            msg.sender == currentFundDeployer,
            "Only the current FundDeployer can call this function"
        );
        _;
    }

    constructor(address _mtc, address _mgm) public {
        MGM = _mgm;
        MTC = _mtc;
    }

    // TODO: Need convenience functions for hasMigrationRequest(), migrationRequestIsExecutable(), getMigrationRequest(), etc?

    /// @dev Only either the fund owner or the nextFundDeployer in the MigrationRequest can call this.
    function cancelMigration(address _vaultProxy, bool _bypassFailure) external override {
        require(_vaultProxy != address(0), "cancelMigration: _vaultProxy cannot be empty");

        MigrationRequest memory request = vaultProxyToMigrationRequest[_vaultProxy];
        address nextFundDeployer = request.nextFundDeployer;
        require(nextFundDeployer != address(0), "cancelMigration: no migration request exists");

        // TODO: confirm that if canMigrate() does not exist but the caller is a valid FundDeployer, this still works.
        require(
            msg.sender == nextFundDeployer || IProxiableVault(_vaultProxy).canMigrate(msg.sender),
            "Only an authorized migrator or the fund's FundDeployer can call this function"
        );

        address prevFundDeployer = vaultProxyToFundDeployer[_vaultProxy];
        address nextVaultAccessor = request.nextVaultAccessor;
        address nextVaultLib = request.nextVaultLib;
        uint256 signalTimestamp = request.signalTimestamp;

        delete vaultProxyToMigrationRequest[_vaultProxy];

        // Allow to fail silently
        bool success;
        bytes memory returnData;
        (success, returnData) = prevFundDeployer.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postCancelMigrationOriginHook.selector,
                _vaultProxy,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        if (!success) {
            require(
                _bypassFailure,
                string(abi.encodePacked("postCancelMigrationOriginHook failure: ", returnData))
            );

            emit PostCancelMigrationOriginHookFailed(
                returnData,
                _vaultProxy,
                prevFundDeployer,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        // TODO: this could be conditional if the sender is the owner rather than the FundDeployer
        (success, returnData) = nextFundDeployer.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postCancelMigrationTargetHook.selector,
                _vaultProxy,
                prevFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        // Allow to fail silently
        if (!success) {
            require(
                _bypassFailure,
                string(abi.encodePacked("postCancelMigrationTargetHook failure: ", returnData))
            );

            emit PostCancelMigrationTargetHookFailed(
                returnData,
                _vaultProxy,
                prevFundDeployer,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        emit MigrationCancelled(
            _vaultProxy,
            prevFundDeployer,
            nextFundDeployer,
            nextVaultAccessor,
            nextVaultLib,
            signalTimestamp
        );
    }

    function deployVaultProxy(
        address _vaultLib,
        address _owner,
        address _vaultAccessor,
        string calldata _fundName
    ) external override onlyCurrentFundDeployer returns (address) {
        // Need to perform validation?
        // require(_manager != address(0), "deployVaultProxy: _manager cannot be empty");

        bytes memory constructData = abi.encodeWithSelector(
            IProxiableVault.init.selector,
            _owner,
            _vaultAccessor,
            _fundName
        );
        address vaultProxy = address(new VaultProxy(constructData, _vaultLib));

        address fundDeployer = msg.sender;
        vaultProxyToFundDeployer[vaultProxy] = fundDeployer;

        emit VaultProxyDeployed(
            fundDeployer,
            _owner,
            vaultProxy,
            _vaultLib,
            _vaultAccessor,
            _fundName
        );

        return vaultProxy;
    }

    function executeMigration(address _vaultProxy, bool _bypassFailure) external override {
        require(_vaultProxy != address(0), "executeMigration: _vaultProxy cannot be empty");

        MigrationRequest memory request = vaultProxyToMigrationRequest[_vaultProxy];
        address nextFundDeployer = request.nextFundDeployer;
        require(
            nextFundDeployer != address(0),
            "executeMigration: No migration request exists for _vaultProxy"
        );
        require(
            msg.sender == nextFundDeployer,
            "executeMigration: Only the target FundDeployer can call this function"
        );
        require(
            nextFundDeployer == currentFundDeployer,
            "executeMigration: The target FundDeployer is no longer the current FundDeployer"
        );

        address prevFundDeployer = vaultProxyToFundDeployer[_vaultProxy];
        address nextVaultAccessor = request.nextVaultAccessor;
        address nextVaultLib = request.nextVaultLib;
        uint256 signalTimestamp = request.signalTimestamp;

        // Allow to fail silently
        bool success;
        bytes memory returnData;
        (success, returnData) = prevFundDeployer.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.preMigrateOriginHook.selector,
                _vaultProxy,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        if (!success) {
            require(
                _bypassFailure,
                string(abi.encodePacked("preMigrateOriginHook failure: ", returnData))
            );

            emit PreMigrateOriginHookFailed(
                returnData,
                _vaultProxy,
                prevFundDeployer,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        // Upgrade the VaultProxy to a new VaultLib and update the accessor via the new VaultLib
        // TODO: Any way to validate that the nextVaultLib can setVaultLib properly?
        IProxiableVault(_vaultProxy).setVaultLib(nextVaultLib);
        // TODO: Any need to make this a general postUpdate() call?
        IProxiableVault(_vaultProxy).setAccessor(nextVaultAccessor);

        // Update FundDeployer for the fund
        vaultProxyToFundDeployer[_vaultProxy] = nextFundDeployer;

        // Remove the migration request
        delete vaultProxyToMigrationRequest[_vaultProxy];

        // Allow to fail silently
        (success, returnData) = prevFundDeployer.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postMigrateOriginHook.selector,
                _vaultProxy,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        if (!success) {
            require(
                _bypassFailure,
                string(abi.encodePacked("postMigrateOriginHook failure: ", returnData))
            );

            emit PostMigrateOriginHookFailed(
                returnData,
                _vaultProxy,
                prevFundDeployer,
                nextFundDeployer,
                nextVaultAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        emit MigrationExecuted(
            _vaultProxy,
            prevFundDeployer,
            nextFundDeployer,
            nextVaultAccessor,
            nextVaultLib,
            signalTimestamp
        );
    }

    // TODO: can check if nextFundDeployer.owner() is MTC
    function setCurrentFundDeployer(address _nextFundDeployer) external override onlyMTC {
        require(
            _nextFundDeployer != address(0),
            "setCurrentFundDeployer: _nextFundDeployer cannot be empty"
        );

        address prevFundDeployer = currentFundDeployer;
        require(
            prevFundDeployer != _nextFundDeployer,
            "setCurrentFundDeployer: _nextFundDeployer is already currentFundDeployer"
        );

        currentFundDeployer = _nextFundDeployer;

        emit CurrentFundDeployerSet(prevFundDeployer, _nextFundDeployer);
    }

    function signalMigration(
        address _vaultProxy,
        address _nextVaultAccessor,
        address _nextVaultLib,
        bool _bypassFailure
    ) external override onlyCurrentFundDeployer {
        require(_vaultProxy != address(0), "signalMigration: _vaultProxy cannot be empty");
        require(
            _nextVaultAccessor != address(0),
            "signalMigration: _nextVaultAccessor cannot be empty"
        );
        require(_nextVaultLib != address(0), "signalMigration: _nextVaultLib cannot be empty");

        address prevFundDeployer = vaultProxyToFundDeployer[_vaultProxy];
        require(prevFundDeployer != address(0), "signalMigration: _vaultProxy does not exist");

        address nextFundDeployer = msg.sender;
        require(
            prevFundDeployer != nextFundDeployer,
            "signalMigration: can only migrate to a new FundDeployer"
        );

        // Allow to fail silently
        bool success;
        bytes memory returnData;
        (success, returnData) = prevFundDeployer.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.preSignalMigrationOriginHook.selector,
                _vaultProxy,
                nextFundDeployer,
                _nextVaultAccessor,
                _nextVaultLib
            )
        );
        if (!success) {
            require(
                _bypassFailure,
                string(abi.encodePacked("preSignalMigrationOriginHook failure: ", returnData))
            );

            emit PreSignalMigrationOriginHookFailed(
                returnData,
                _vaultProxy,
                prevFundDeployer,
                nextFundDeployer,
                _nextVaultAccessor,
                _nextVaultLib
            );
        }

        vaultProxyToMigrationRequest[_vaultProxy] = MigrationRequest({
            nextFundDeployer: nextFundDeployer,
            nextVaultAccessor: _nextVaultAccessor,
            nextVaultLib: _nextVaultLib,
            signalTimestamp: now
        });

        // Allow to fail silently
        (success, returnData) = prevFundDeployer.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postSignalMigrationOriginHook.selector,
                _vaultProxy,
                nextFundDeployer,
                _nextVaultAccessor,
                _nextVaultLib
            )
        );
        if (!success) {
            require(
                _bypassFailure,
                string(abi.encodePacked("postSignalMigrationOriginHook failure: ", returnData))
            );

            emit PostSignalMigrationOriginHookFailed(
                returnData,
                _vaultProxy,
                prevFundDeployer,
                nextFundDeployer,
                _nextVaultAccessor,
                _nextVaultLib
            );
        }

        emit MigrationSignaled(
            _vaultProxy,
            prevFundDeployer,
            nextFundDeployer,
            _nextVaultAccessor,
            _nextVaultLib
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getCurrentFundDeployer() external override view returns (address) {
        return currentFundDeployer;
    }

    function getMGM() external override view returns (address) {
        return MGM;
    }

    function getMigrationRequestDetailsForFund(address _vaultProxy)
        external
        override
        view
        returns (
            address nextFundDeployer_,
            address nextVaultAccessor_,
            address nextVaultLib_,
            uint256 signalTimestamp_
        )
    {
        MigrationRequest memory r = vaultProxyToMigrationRequest[_vaultProxy];
        if (r.signalTimestamp > 0) {
            return (r.nextFundDeployer, r.nextVaultAccessor, r.nextVaultLib, r.signalTimestamp);
        }
    }

    function getMTC() external override view returns (address) {
        return MTC;
    }

    function getFundDeployerForFund(address _vaultProxy) external override view returns (address) {
        return vaultProxyToFundDeployer[_vaultProxy];
    }
}

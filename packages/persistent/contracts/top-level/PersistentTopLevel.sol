// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../vault/IProxiableVault.sol";
import "../vault/VaultProxy.sol";
import "./IMigrationHookHandler.sol";
import "./IPersistentTopLevel.sol";

/// @title PersistentTopLevel Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract linking multiple releases of Melon infrastructure.
/// It regulates migrations between releases, and provides access control constants
/// for making changes to infrastructural config.
contract PersistentTopLevel is IPersistentTopLevel {
    // TODO: Confirm whether low level calls to non-existent functions succeed or fail (and especially that they fail silently)

    // Events

    // TODO: Go through events one-by-one
    event CurrentReleaseSet(address prevRelease, address nextRelease);

    event MigrationCancelled(
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event MigrationExecuted(
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event MigrationSignaled(
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib
    );

    event PostCancelMigrationOriginHookFailed(
        string failureMessage,
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PostCancelMigrationTargetHookFailed(
        string failureMessage,
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PreMigrateOriginHookFailed(
        string failureMessage,
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PostMigrateOriginHookFailed(
        string failureMessage,
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib,
        uint256 signalTimestamp
    );

    event PreSignalMigrationOriginHookFailed(
        string failureMessage,
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib
    );

    event PostSignalMigrationOriginHookFailed(
        string failureMessage,
        address indexed vaultProxy,
        address indexed prevRelease,
        address indexed nextRelease,
        address nextAccessor,
        address nextVaultLib
    );

    event VaultProxyDeployed(
        address indexed release,
        address indexed owner,
        address vaultProxy,
        address vaultLib,
        address accessor,
        string fundName
    );

    struct MigrationRequest {
        address nextRelease;
        address nextAccessor;
        address nextVaultLib;
        uint256 signalTimestamp;
    }

    // Constants
    address internal immutable MGM;
    address internal immutable MTC;

    // Releases
    address internal currentRelease;

    // VaultProxies
    // TODO: do we want an ownerToVaultProxies array?
    mapping(address => address) internal vaultProxyToRelease;
    mapping(address => MigrationRequest) internal vaultProxyToMigrationRequest;

    modifier onlyMTC() {
        require(msg.sender == MTC, "Only MTC can call this function");
        _;
    }

    modifier onlyCurrentRelease() {
        require(msg.sender == currentRelease, "Only the current release can call this function");
        _;
    }

    constructor(address _mtc, address _mgm) public {
        MGM = _mgm;
        MTC = _mtc;
    }

    // TODO: Need convenience functions for hasMigrationRequest(), migrationRequestIsExecutable(), getMigrationRequest(), etc?

    /// @dev Only either the fund owner or the nextRelease in the MigrationRequest can call this.
    // TODO: anyone can cancel if the nextRelease is invalid or if the request is stale? This could happen at the release level
    function cancelMigration(address _vaultProxy) external override {
        require(_vaultProxy != address(0), "cancelMigration: _vaultProxy cannot be empty");

        MigrationRequest memory request = vaultProxyToMigrationRequest[_vaultProxy];
        address nextRelease = request.nextRelease;
        require(nextRelease != address(0), "cancelMigration: no migration request exists");

        // TODO: confirm that if getOwner() does not exist but the caller is a valid release, this still works.
        // TODO: consider storing owner in request struct
        require(
            msg.sender == nextRelease || msg.sender == IProxiableVault(_vaultProxy).getOwner(),
            "Only the fund owner or the fund's active release can call this function"
        );

        address prevRelease = vaultProxyToRelease[_vaultProxy];
        address nextAccessor = request.nextAccessor;
        address nextVaultLib = request.nextVaultLib;
        uint256 signalTimestamp = request.signalTimestamp;

        delete vaultProxyToMigrationRequest[_vaultProxy];

        // Allow to fail silently
        bool success;
        bytes memory returnData;
        (success, returnData) = prevRelease.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postCancelMigrationOriginHook.selector,
                _vaultProxy,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        if (!success) {
            emit PostCancelMigrationOriginHookFailed(
                string(returnData),
                _vaultProxy,
                prevRelease,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        // TODO: this could be conditional if the sender is the owner rather than the release
        (success, returnData) = nextRelease.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postCancelMigrationTargetHook.selector,
                _vaultProxy,
                prevRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        // Allow to fail silently
        if (!success) {
            emit PostCancelMigrationTargetHookFailed(
                string(returnData),
                _vaultProxy,
                prevRelease,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        emit MigrationCancelled(
            _vaultProxy,
            prevRelease,
            nextRelease,
            nextAccessor,
            nextVaultLib,
            signalTimestamp
        );
    }

    function deployVaultProxy(
        address _vaultLib,
        address _owner,
        address _accessor,
        string calldata _fundName
    ) external override onlyCurrentRelease returns (address) {
        // Need to perform validation?
        // require(_manager != address(0), "deployVaultProxy: _manager cannot be empty");

        bytes memory constructData = abi.encodeWithSelector(
            IProxiableVault.init.selector,
            _owner,
            _accessor,
            _fundName
        );
        address vaultProxy = address(new VaultProxy(constructData, _vaultLib));

        address release = msg.sender;
        vaultProxyToRelease[vaultProxy] = release;

        emit VaultProxyDeployed(release, _owner, vaultProxy, _vaultLib, _accessor, _fundName);

        return vaultProxy;
    }

    function executeMigration(address _vaultProxy) external override {
        require(_vaultProxy != address(0), "executeMigration: _vaultProxy cannot be empty");

        MigrationRequest memory request = vaultProxyToMigrationRequest[_vaultProxy];
        address nextRelease = request.nextRelease;
        require(
            nextRelease != address(0),
            "executeMigration: No migration request exists for _vaultProxy"
        );
        require(
            msg.sender == nextRelease,
            "executeMigration: Only the target release can call this function"
        );
        require(
            nextRelease == currentRelease,
            "executeMigration: The target release is no longer the current release"
        );

        address prevRelease = vaultProxyToRelease[_vaultProxy];
        address nextAccessor = request.nextAccessor;
        address nextVaultLib = request.nextVaultLib;
        uint256 signalTimestamp = request.signalTimestamp;

        // Allow to fail silently
        bool success;
        bytes memory returnData;
        (success, returnData) = prevRelease.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.preMigrateOriginHook.selector,
                _vaultProxy,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        if (!success) {
            emit PreMigrateOriginHookFailed(
                string(returnData),
                _vaultProxy,
                prevRelease,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        // Upgrade the VaultProxy to a new VaultLib and update the Accessor via the new VaultLib
        // TODO: Any way to validate that the nextVaultLib can setVaultLib properly?
        IProxiableVault(_vaultProxy).setVaultLib(nextVaultLib);
        // TODO: Any need to make this a general postUpdate() call?
        IProxiableVault(_vaultProxy).setAccessor(nextAccessor);

        // Update release for the fund
        vaultProxyToRelease[_vaultProxy] = nextRelease;

        // Remove the migration request
        delete vaultProxyToMigrationRequest[_vaultProxy];

        // Allow to fail silently
        (success, returnData) = prevRelease.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postMigrateOriginHook.selector,
                _vaultProxy,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            )
        );
        if (!success) {
            emit PostMigrateOriginHookFailed(
                string(returnData),
                _vaultProxy,
                prevRelease,
                nextRelease,
                nextAccessor,
                nextVaultLib,
                signalTimestamp
            );
        }

        emit MigrationExecuted(
            _vaultProxy,
            prevRelease,
            nextRelease,
            nextAccessor,
            nextVaultLib,
            signalTimestamp
        );
    }

    // TODO: can check if nextRelease.owner() is MTC
    function setCurrentRelease(address _nextRelease) external onlyMTC {
        require(_nextRelease != address(0), "setCurrentRelease: _nextRelease cannot be empty");

        address prevRelease = currentRelease;
        require(
            prevRelease != _nextRelease,
            "setCurrentRelease: _nextRelease is already currentRelease"
        );

        currentRelease = _nextRelease;

        emit CurrentReleaseSet(prevRelease, _nextRelease);
    }

    function signalMigration(
        address _vaultProxy,
        address _nextAccessor,
        address _nextVaultLib
    ) external override onlyCurrentRelease {
        require(_vaultProxy != address(0), "signalMigration: _vaultProxy cannot be empty");
        require(_nextAccessor != address(0), "signalMigration: _nextAccessor cannot be empty");
        require(_nextVaultLib != address(0), "signalMigration: _nextVaultLib cannot be empty");

        address prevRelease = vaultProxyToRelease[_vaultProxy];
        require(prevRelease != address(0), "signalMigration: _vaultProxy does not exist");

        address nextRelease = msg.sender;
        require(
            prevRelease != nextRelease,
            "signalMigration: can only migrate to a different release"
        );

        // Allow to fail silently
        bool success;
        bytes memory returnData;
        (success, returnData) = prevRelease.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.preSignalMigrationOriginHook.selector,
                _vaultProxy,
                nextRelease,
                _nextAccessor,
                _nextVaultLib
            )
        );
        if (!success) {
            emit PreSignalMigrationOriginHookFailed(
                string(returnData),
                _vaultProxy,
                prevRelease,
                nextRelease,
                _nextAccessor,
                _nextVaultLib
            );
        }

        vaultProxyToMigrationRequest[_vaultProxy] = MigrationRequest({
            nextRelease: nextRelease,
            nextAccessor: _nextAccessor,
            nextVaultLib: _nextVaultLib,
            signalTimestamp: now
        });

        // Allow to fail silently
        (success, returnData) = prevRelease.call(
            abi.encodeWithSelector(
                IMigrationHookHandler.postSignalMigrationOriginHook.selector,
                _vaultProxy,
                nextRelease,
                _nextAccessor,
                _nextVaultLib
            )
        );
        if (!success) {
            emit PostSignalMigrationOriginHookFailed(
                string(returnData),
                _vaultProxy,
                prevRelease,
                nextRelease,
                _nextAccessor,
                _nextVaultLib
            );
        }

        emit MigrationSignaled(
            _vaultProxy,
            prevRelease,
            nextRelease,
            _nextAccessor,
            _nextVaultLib
        );
    }

    // EXTERNAL FUNCTIONS - VIEW

    function fundHasMigrationRequest(address _vaultProxy) external view returns (bool) {
        return vaultProxyToMigrationRequest[_vaultProxy].signalTimestamp > 0;
    }

    function getCurrentRelease() external view returns (address) {
        return currentRelease;
    }

    function getMGM() external override view returns (address) {
        return MGM;
    }

    function getMigrationRequestDetailsForFund(address _vaultProxy)
        external
        view
        returns (
            address nextRelease_,
            address nextAccessor_,
            address nextVaultLib_,
            uint256 signalTimestamp_
        )
    {
        MigrationRequest memory r = vaultProxyToMigrationRequest[_vaultProxy];
        if (r.signalTimestamp > 0) {
            return (r.nextRelease, r.nextAccessor, r.nextVaultLib, r.signalTimestamp);
        }
    }

    function getMTC() external override view returns (address) {
        return MTC;
    }

    function getReleaseForFund(address _vaultProxy) external view returns (address) {
        return vaultProxyToRelease[_vaultProxy];
    }
}

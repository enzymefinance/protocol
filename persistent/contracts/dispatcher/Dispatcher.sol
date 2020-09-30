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

    event MigrationTimelockSet(uint256 prevTimelock, uint256 nextTimelock);

    event NominatedOwnerSet(address indexed nominatedOwner);

    event NominatedOwnerRemoved(address indexed nominatedOwner);

    event OwnershipTransferred(address indexed prevOwner, address indexed nextOwner);

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

    address private currentFundDeployer;
    address private nominatedOwner;
    address private owner;
    uint256 private migrationTimelock;
    mapping(address => address) private vaultProxyToFundDeployer;
    mapping(address => MigrationRequest) private vaultProxyToMigrationRequest;

    modifier onlyCurrentFundDeployer() {
        require(
            msg.sender == currentFundDeployer,
            "Only the current FundDeployer can call this function"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the contract owner can call this function");
        _;
    }

    constructor() public {
        owner = msg.sender;
        migrationTimelock = 2 days;
    }

    ////////////////////
    // ACCESS CONTROL //
    ////////////////////

    /// @notice Claim ownership of the contract
    function claimOwnership() external override {
        address nextOwner = nominatedOwner;
        require(
            msg.sender == nextOwner,
            "acceptOwnership: Only the nominatedOwner can call this function"
        );

        delete nominatedOwner;

        address prevOwner = owner;
        owner = nextOwner;

        emit OwnershipTransferred(prevOwner, nextOwner);
    }

    /// @notice Revoke the nomination of a new contract owner
    function removeNominatedOwner() external override onlyOwner {
        address removedNominatedOwner = nominatedOwner;
        require(
            removedNominatedOwner != address(0),
            "revokeOwnershipNomination: there is no nominated owner"
        );

        delete nominatedOwner;

        emit NominatedOwnerRemoved(removedNominatedOwner);
    }

    /// @notice Set a new FundDeployer for use within the contract
    /// @param _nextFundDeployer The address of the FundDeployer contract
    function setCurrentFundDeployer(address _nextFundDeployer) external override onlyOwner {
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

    /// @notice Nominate a new contract owner
    /// @param _nextNominatedOwner The account to nominate
    function setNominatedOwner(address _nextNominatedOwner) external override onlyOwner {
        require(_nextNominatedOwner != address(0), "nominateOwner: _nextOwner cannot be empty");
        require(_nextNominatedOwner != owner, "nominateOwner: _nextOwner is already the owner");
        require(
            _nextNominatedOwner != nominatedOwner,
            "nominateOwner: _nextOwner is already nominated"
        );

        nominatedOwner = _nextNominatedOwner;

        emit NominatedOwnerSet(_nextNominatedOwner);
    }

    ////////////////
    // DEPLOYMENT //
    ////////////////

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

    ////////////////
    // MIGRATIONS //
    ////////////////

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
        uint256 signalTimestamp = request.signalTimestamp;
        // No chance of underflow, so since we are not using a SafeMath library otherwise,
        // we use the default solidity subtraction operation here.
        require(
            block.timestamp - signalTimestamp >= migrationTimelock,
            "executeMigration: The migration timelock has not been met"
        );

        address prevFundDeployer = vaultProxyToFundDeployer[_vaultProxy];
        address nextVaultAccessor = request.nextVaultAccessor;
        address nextVaultLib = request.nextVaultLib;

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

    /// @notice Set a new migration timelock
    /// @param _nextTimelock The number of seconds for the new timelock
    function setMigrationTimelock(uint256 _nextTimelock) external override onlyOwner {
        uint256 prevTimelock = migrationTimelock;
        require(
            _nextTimelock != prevTimelock,
            "setMigrationTimelock: _nextTimelock is the current timelock"
        );

        migrationTimelock = _nextTimelock;

        emit MigrationTimelockSet(prevTimelock, _nextTimelock);
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

    function getFundDeployerForVaultProxy(address _vaultProxy)
        external
        override
        view
        returns (address)
    {
        return vaultProxyToFundDeployer[_vaultProxy];
    }

    function getMigrationRequestDetailsForVaultProxy(address _vaultProxy)
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

    function getMigrationTimelock() external override view returns (uint256) {
        return migrationTimelock;
    }

    function getNominatedOwner() external override view returns (address) {
        return nominatedOwner;
    }

    function getOwner() external override view returns (address) {
        return owner;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import
    "../../../release/extensions/external-position-manager/external-positions/maple-liquidity/MapleLiquidityPositionLib.sol";
import "../../dispatcher/IDispatcher.sol";

/// @title MapleV1ToV2PoolMapper Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract for associating Maple v1 to Maple v2 pools
contract MapleV1ToV2PoolMapper {
    event MigrationAllowed();

    event PoolMapped(address poolTokenV1, address poolTokenV2);

    event SnapshotsFrozen();

    address private immutable DISPATCHER;

    bool private migrationDisallowed;
    bool private snapshotsAllowed;

    mapping(address => address) private poolTokenV1ToPoolTokenV2;

    modifier onlyDispatcherOwner() {
        require(msg.sender == IDispatcher(DISPATCHER).getOwner(), "Only the Dispatcher owner can call this function");
        _;
    }

    constructor(address _dispacher) public {
        DISPATCHER = _dispacher;

        migrationDisallowed = true;
        snapshotsAllowed = true;
    }

    ////////////////////////////
    // BULK MIGRATION HELPERS //
    ////////////////////////////

    /// @notice Runs pool migration logic on the proxy of each MapleLiquidityPosition
    /// @dev No need to validate _proxies
    function migrateExternalPositions(address[] calldata _proxies) external {
        for (uint256 i; i < _proxies.length; i++) {
            MapleLiquidityPositionLib(_proxies[i]).migratePoolsV1ToV2();
        }
    }

    /// @notice Runs MPTv1 snapshotting logic on the proxy of each MapleLiquidityPosition
    /// @dev No need to validate _proxies
    function snapshotExternalPositions(address[] calldata _proxies) external {
        for (uint256 i; i < _proxies.length; i++) {
            MapleLiquidityPositionLib(_proxies[i]).snapshotPoolTokenV1BalanceValues();
        }
    }

    ///////////
    // ADMIN //
    ///////////

    /// @notice Allows external positions to migrate their pools using the pool mapping
    function allowMigration() external onlyDispatcherOwner {
        migrationDisallowed = false;

        emit MigrationAllowed();
    }

    /// @notice Associates Maple Pool Tokens v1 to their v2 equivalent
    /// @param _poolTokensV1 The Maple Pool Tokens v1
    /// @param _poolTokensV2 The Maple Pool Tokens v2
    function mapPools(address[] calldata _poolTokensV1, address[] calldata _poolTokensV2)
        external
        onlyDispatcherOwner
    {
        for (uint256 i; i < _poolTokensV1.length; i++) {
            address poolTokenV1 = _poolTokensV1[i];
            address poolTokenV2 = _poolTokensV2[i];

            poolTokenV1ToPoolTokenV2[poolTokenV1] = poolTokenV2;

            emit PoolMapped(poolTokenV1, poolTokenV2);
        }
    }

    /// @notice Freezes snapshots
    function freezeSnapshots() external onlyDispatcherOwner {
        snapshotsAllowed = false;

        emit SnapshotsFrozen();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the Maple Pool Token v2 associated to a given Maple Pool Token v1
    /// @param _poolTokenV1 The Maple Pool Token v1
    /// @return poolTokenV2_ The Maple Pool Token v2
    function getPoolTokenV2FromPoolTokenV1(address _poolTokenV1) external view returns (address poolTokenV2_) {
        return poolTokenV1ToPoolTokenV2[_poolTokenV1];
    }

    /// @notice Checks whether pool migration is allowed for Enzyme external positions
    /// @return allowed_ True if migration is allowed
    function migrationIsAllowed() external view returns (bool allowed_) {
        return !migrationDisallowed;
    }

    /// @notice Checks whether pool v1 snapshots are allowed for Enzyme external positions
    /// @return allowed_ True if snapshots are allowed
    function snapshotsAreAllowed() external view returns (bool allowed_) {
        return snapshotsAllowed;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../release/utils/NominatedOwnerMixin.sol";
import "../IArbitraryValueOracle.sol";

/// @title ManualValueOracleLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for ManualValueOracleProxy instances
contract ManualValueOracleLib is IArbitraryValueOracle, NominatedOwnerMixin {
    event Initialized(string description);

    event UpdaterSet(address updater);

    event ValueUpdated(int256 value);

    address private updater;
    // Var packed
    int192 private value;
    uint64 private lastUpdated;

    /// @notice Initializes the proxy
    /// @param _owner The owner of the oracle
    /// @param _updater The updater of the oracle value
    function init(
        address _owner,
        address _updater,
        string calldata _description
    ) external {
        require(getOwner() == address(0), "init: Already initialized");
        require(_owner != address(0), "init: Empty _owner");

        __setOwner(_owner);

        emit Initialized(_description);

        if (_updater != address(0)) {
            __setUpdater(_updater);
        }
    }

    /// @notice Sets the updater
    /// @param _nextUpdater The next updater
    function setUpdater(address _nextUpdater) external onlyOwner {
        __setUpdater(_nextUpdater);
    }

    /// @notice Updates the oracle value
    /// @param _nextValue The next value
    function updateValue(int192 _nextValue) external {
        require(msg.sender == getUpdater(), "updateValue: Unauthorized");

        value = _nextValue;
        lastUpdated = uint64(block.timestamp);

        emit ValueUpdated(_nextValue);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to set the updater
    function __setUpdater(address _nextUpdater) private {
        updater = _nextUpdater;

        emit UpdaterSet(_nextUpdater);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    // EXTERNAL FUNCTIONS

    /// @notice Gets the oracle value with last updated timestamp
    /// @return value_ The value
    /// @return lastUpdated_ The timestamp of the last update
    function getValueWithTimestamp()
        external
        view
        override
        returns (int256 value_, uint256 lastUpdated_)
    {
        return (getValue(), getLastUpdated());
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the last updated timestamp
    /// @return lastUpdated_ The timestamp of the last update
    function getLastUpdated() public view override returns (uint256 lastUpdated_) {
        return lastUpdated;
    }

    /// @notice Gets the updater of the oracle value
    /// @param updater_ The updater
    function getUpdater() public view returns (address updater_) {
        return updater;
    }

    /// @notice Gets the oracle value only
    /// @return value_ The value
    function getValue() public view override returns (int256 value_) {
        return value;
    }
}

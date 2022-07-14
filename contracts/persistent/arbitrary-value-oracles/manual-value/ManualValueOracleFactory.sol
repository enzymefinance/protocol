// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./ManualValueOracleLib.sol";
import "./ManualValueOracleProxy.sol";

/// @title ManualValueOracleFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for ManualValueOracleProxy instances
contract ManualValueOracleFactory {
    event ProxyDeployed(address indexed caller, address proxy);

    address private immutable LIB;

    constructor() public {
        LIB = address(new ManualValueOracleLib());
    }

    /// @notice Deploys a ManualValueOracleProxy instance
    /// @param _owner The owner of the oracle
    /// @param _updater The updater of the oracle
    /// @param _description A short encoded description for the oracle
    /// @return proxy_ The deployed ManualValueOracleProxy address
    function deploy(
        address _owner,
        address _updater,
        bytes32 _description
    ) external returns (address proxy_) {
        bytes memory constructData = abi.encodeWithSelector(
            ManualValueOracleLib.init.selector,
            _owner,
            _updater,
            _description
        );

        proxy_ = address(new ManualValueOracleProxy(constructData, LIB));

        emit ProxyDeployed(msg.sender, proxy_);

        return proxy_;
    }
}

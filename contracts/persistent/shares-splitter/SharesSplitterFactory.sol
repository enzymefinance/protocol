// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./SharesSplitterLib.sol";
import "./SharesSplitterProxy.sol";

/// @title SharesSplitterFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for SharesSplitterProxy instances
contract SharesSplitterFactory {
    event ProxyDeployed(address indexed caller, address proxy);

    address private immutable SHARES_SPLITTER;

    constructor(address _globalConfigProxy) public {
        SHARES_SPLITTER = address(new SharesSplitterLib(_globalConfigProxy, address(this)));
    }

    /// @notice Deploys a SharesSplitterProxy instance
    /// @param _users The users to give a split percentage
    /// @param _splitPercentages The ordered split percentages corresponding to _users
    /// @return sharesSplitter_ The deployed SharesSplitterProxy address
    function deploy(address[] calldata _users, uint256[] calldata _splitPercentages)
        external
        returns (address sharesSplitter_)
    {
        require(_users.length == _splitPercentages.length, "deploy: Unequal arrays");

        bytes memory constructData = abi.encodeWithSelector(
            SharesSplitterLib.init.selector,
            _users,
            _splitPercentages
        );

        sharesSplitter_ = address(new SharesSplitterProxy(constructData, SHARES_SPLITTER));

        emit ProxyDeployed(msg.sender, sharesSplitter_);

        return sharesSplitter_;
    }
}

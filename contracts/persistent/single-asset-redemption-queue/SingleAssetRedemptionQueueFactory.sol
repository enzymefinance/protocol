// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {NonUpgradableProxy} from "../../utils/0.8.19/NonUpgradableProxy.sol";
import {ISingleAssetRedemptionQueue} from "./ISingleAssetRedemptionQueue.sol";

/// @title SingleAssetRedemptionQueueFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A factory for SingleAssetRedemptionQueue proxy instances
contract SingleAssetRedemptionQueueFactory {
    event ProxyDeployed(address indexed deployer, address indexed proxyAddress, address indexed vaultProxy);

    address internal immutable LIB_ADDRESS;

    constructor(address _libAddress) {
        LIB_ADDRESS = _libAddress;
    }

    function deployProxy(
        address _vaultProxy,
        address _redemptionAssetAddress,
        uint256 _bypassableSharesThreshold,
        address[] calldata _managers
    ) external returns (address proxyAddress_) {
        bytes memory constructData = abi.encodeWithSelector(
            ISingleAssetRedemptionQueue.init.selector,
            _vaultProxy,
            _redemptionAssetAddress,
            _bypassableSharesThreshold,
            _managers
        );

        proxyAddress_ = address(new NonUpgradableProxy({_constructData: constructData, _contractLogic: LIB_ADDRESS}));

        emit ProxyDeployed(msg.sender, proxyAddress_, _vaultProxy);

        return proxyAddress_;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../core/fund/comptroller/ComptrollerLib.sol";
import "../../core/fund/vault/VaultLib.sol";
import "./AuthUserExecutedSharesRequestorProxy.sol";
import "./IAuthUserExecutedSharesRequestor.sol";

/// @title AuthUserExecutedSharesRequestorFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Deploys and maintains a record of AuthUserExecutedSharesRequestorProxy instances
contract AuthUserExecutedSharesRequestorFactory {
    event SharesRequestorProxyDeployed(
        address indexed comptrollerProxy,
        address sharesRequestorProxy
    );

    address private immutable AUTH_USER_EXECUTED_SHARES_REQUESTOR_LIB;
    address private immutable DISPATCHER;

    mapping(address => address) private comptrollerProxyToSharesRequestorProxy;

    constructor(address _dispatcher, address _authUserExecutedSharesRequestorLib) public {
        AUTH_USER_EXECUTED_SHARES_REQUESTOR_LIB = _authUserExecutedSharesRequestorLib;
        DISPATCHER = _dispatcher;
    }

    /// @notice Deploys a shares requestor proxy instance for a given ComptrollerProxy instance
    /// @param _comptrollerProxy The ComptrollerProxy for which to deploy the shares requestor proxy
    /// @return sharesRequestorProxy_ The address of the newly-deployed shares requestor proxy
    function deploySharesRequestorProxy(address _comptrollerProxy)
        external
        returns (address sharesRequestorProxy_)
    {
        // Confirm fund is genuine
        VaultLib vaultProxyContract = VaultLib(ComptrollerLib(_comptrollerProxy).getVaultProxy());
        require(
            vaultProxyContract.getAccessor() == _comptrollerProxy,
            "deploySharesRequestorProxy: Invalid VaultProxy for ComptrollerProxy"
        );
        require(
            IDispatcher(DISPATCHER).getFundDeployerForVaultProxy(address(vaultProxyContract)) !=
                address(0),
            "deploySharesRequestorProxy: Not a genuine fund"
        );

        // Validate that the caller is the fund owner
        require(
            msg.sender == vaultProxyContract.getOwner(),
            "deploySharesRequestorProxy: Only fund owner callable"
        );

        // Validate that a proxy does not already exist
        require(
            comptrollerProxyToSharesRequestorProxy[_comptrollerProxy] == address(0),
            "deploySharesRequestorProxy: Proxy already exists"
        );

        // Deploy the proxy
        bytes memory constructData = abi.encodeWithSelector(
            IAuthUserExecutedSharesRequestor.init.selector,
            _comptrollerProxy
        );
        sharesRequestorProxy_ = address(
            new AuthUserExecutedSharesRequestorProxy(
                constructData,
                AUTH_USER_EXECUTED_SHARES_REQUESTOR_LIB
            )
        );

        comptrollerProxyToSharesRequestorProxy[_comptrollerProxy] = sharesRequestorProxy_;

        emit SharesRequestorProxyDeployed(_comptrollerProxy, sharesRequestorProxy_);

        return sharesRequestorProxy_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the value of the `AUTH_USER_EXECUTED_SHARES_REQUESTOR_LIB` variable
    /// @return authUserExecutedSharesRequestorLib_ The `AUTH_USER_EXECUTED_SHARES_REQUESTOR_LIB` variable value
    function getAuthUserExecutedSharesRequestorLib()
        external
        view
        returns (address authUserExecutedSharesRequestorLib_)
    {
        return AUTH_USER_EXECUTED_SHARES_REQUESTOR_LIB;
    }

    /// @notice Gets the value of the `DISPATCHER` variable
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() external view returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the AuthUserExecutedSharesRequestorProxy associated with the given ComptrollerProxy
    /// @param _comptrollerProxy The ComptrollerProxy for which to get the associated AuthUserExecutedSharesRequestorProxy
    /// @return sharesRequestorProxy_ The associated AuthUserExecutedSharesRequestorProxy address
    function getSharesRequestorProxyForComptrollerProxy(address _comptrollerProxy)
        external
        view
        returns (address sharesRequestorProxy_)
    {
        return comptrollerProxyToSharesRequestorProxy[_comptrollerProxy];
    }
}

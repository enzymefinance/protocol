// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../persistent/address-list-registry/AddressListRegistry.sol";
import "./ArbitraryTokenPhasedSharesWrapperLib.sol";
import "./ArbitraryTokenPhasedSharesWrapperProxy.sol";

/// @title ArbitraryTokenPhasedSharesWrapperFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for ArbitraryTokenPhasedSharesWrapperProxy instances
contract ArbitraryTokenPhasedSharesWrapperFactory {
    event ProxyDeployed(address indexed caller, address proxy);

    address private immutable LIB;

    constructor(
        address _dispatcher,
        address _addressListRegistry,
        address _fundDeployerV4,
        address _protocolFeeRecipient,
        uint256 _protocolFeeBps
    ) public {
        LIB = address(
            new ArbitraryTokenPhasedSharesWrapperLib(
                _dispatcher,
                _addressListRegistry,
                _fundDeployerV4,
                _protocolFeeRecipient,
                _protocolFeeBps,
                address(this)
            )
        );
    }

    /// @notice Deploys a ArbitraryTokenPhasedSharesWrapperProxy instance
    /// @param _vaultProxy The VaultProxy that will have its shares wrapped
    /// @param _depositToken The token that users deposit to the wrapper to receive wrapped shares
    /// @param _allowedDepositorListId The id of an AddressListRegistry list to use for validating allowed depositors
    /// @param _transfersAllowed True if wrapped shares transfers are allowed
    /// @param _totalDepositMax The total amount of deposit token that can be deposited
    /// @param _feeRecipient The recipient of the wrapper fee
    /// @param _feeBps The wrapper fee amount in bps
    /// @param _feeExcludesDepositTokenPrincipal True if the fee excludes the total _depositToken amount deposited
    /// @param _manager The manager of the wrapper
    function deploy(
        address _vaultProxy,
        address _depositToken,
        uint128 _allowedDepositorListId,
        bool _transfersAllowed,
        uint128 _totalDepositMax,
        address _feeRecipient,
        uint16 _feeBps,
        bool _feeExcludesDepositTokenPrincipal,
        address _manager
    ) external returns (address wrapperProxy_) {
        bytes memory constructData = abi.encodeWithSelector(
            ArbitraryTokenPhasedSharesWrapperLib.init.selector,
            _vaultProxy,
            _depositToken,
            _allowedDepositorListId,
            _transfersAllowed,
            _totalDepositMax,
            _feeRecipient,
            _feeBps,
            _feeExcludesDepositTokenPrincipal,
            _manager
        );

        wrapperProxy_ = address(new ArbitraryTokenPhasedSharesWrapperProxy(constructData, LIB));

        emit ProxyDeployed(msg.sender, wrapperProxy_);

        return wrapperProxy_;
    }
}

// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/BeaconProxy.sol";
import "@openzeppelin/contracts/proxy/IBeacon.sol";
import "../../dispatcher/IDispatcher.sol";
import "./bases/GatedRedemptionQueueSharesWrapperLibBase1.sol";

/// @title GatedRedemptionQueueSharesWrapperFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for GatedRedemptionQueueSharesWrapper instances
contract GatedRedemptionQueueSharesWrapperFactory is IBeacon {
    event ImplementationSet(address implementation);

    event ProxyDeployed(address indexed caller, address proxy);

    IDispatcher private immutable DISPATCHER_CONTRACT;

    address public override implementation;

    constructor(address _dispatcher, address _implementation) public {
        DISPATCHER_CONTRACT = IDispatcher(_dispatcher);
        implementation = _implementation;
    }

    /// @notice Deploys a proxy instance
    /// @param _vaultProxy The VaultProxy that will have its shares wrapped
    /// @param _managers Users to give the role of manager for the wrapper
    /// @param _redemptionAsset The asset to receive during shares redemptions
    /// @param _useDepositApprovals True if deposit pre-approvals are required
    /// @param _useRedemptionApprovals True if the redemption request pre-approvals are required
    /// @param _useTransferApprovals True if shares transfer pre-approvals are required
    /// @param _windowConfig Initial redemption window configuration
    /// @return wrapperProxy_ The deployed wrapper proxy
    function deploy(
        address _vaultProxy,
        address[] calldata _managers,
        address _redemptionAsset,
        bool _useDepositApprovals,
        bool _useRedemptionApprovals,
        bool _useTransferApprovals,
        GatedRedemptionQueueSharesWrapperLibBase1.RedemptionWindowConfig calldata _windowConfig
    ) external returns (address wrapperProxy_) {
        require(
            DISPATCHER_CONTRACT.getFundDeployerForVaultProxy(_vaultProxy) != address(0),
            "_vaultProxy: Invalid vault"
        );

        bytes memory constructData = abi.encodeWithSelector(
            GatedRedemptionQueueSharesWrapperLibBase1.init.selector,
            _vaultProxy,
            _managers,
            _redemptionAsset,
            _useDepositApprovals,
            _useRedemptionApprovals,
            _useTransferApprovals,
            _windowConfig
        );

        wrapperProxy_ = address(new BeaconProxy({beacon: address(this), data: constructData}));

        emit ProxyDeployed(msg.sender, wrapperProxy_);

        return wrapperProxy_;
    }

    ///////////
    // ADMIN //
    ///////////

    /// @notice Gets the contract owner
    /// @param _nextImplementation The next implementation contract
    function setImplementation(address _nextImplementation) external {
        require(msg.sender == DISPATCHER_CONTRACT.getOwner(), "setImplementation: Unauthorized");

        implementation = _nextImplementation;

        emit ImplementationSet(_nextImplementation);
    }
}

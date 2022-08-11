// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

import "../../utils/beacon-proxy/IBeaconProxyFactory.sol";
import "./IGasRelayPaymaster.sol";

pragma solidity 0.6.12;

/// @title GasRelayRecipientMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mixin that enables receiving GSN-relayed calls
/// @dev IMPORTANT: Do not use storage var in this contract,
/// unless it is no longer inherited by the VaultLib
abstract contract GasRelayRecipientMixin {
    address internal immutable GAS_RELAY_PAYMASTER_FACTORY;

    constructor(address _gasRelayPaymasterFactory) internal {
        GAS_RELAY_PAYMASTER_FACTORY = _gasRelayPaymasterFactory;
    }

    /// @dev Helper to parse the canonical sender of a tx based on whether it has been relayed
    function __msgSender() internal view returns (address payable canonicalSender_) {
        if (msg.data.length >= 24 && msg.sender == getGasRelayTrustedForwarder()) {
            assembly {
                canonicalSender_ := shr(96, calldataload(sub(calldatasize(), 20)))
            }

            return canonicalSender_;
        }

        return msg.sender;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `GAS_RELAY_PAYMASTER_FACTORY` variable
    /// @return gasRelayPaymasterFactory_ The `GAS_RELAY_PAYMASTER_FACTORY` variable value
    function getGasRelayPaymasterFactory()
        public
        view
        returns (address gasRelayPaymasterFactory_)
    {
        return GAS_RELAY_PAYMASTER_FACTORY;
    }

    /// @notice Gets the trusted forwarder for GSN relaying
    /// @return trustedForwarder_ The trusted forwarder
    function getGasRelayTrustedForwarder() public view returns (address trustedForwarder_) {
        return
            IGasRelayPaymaster(
                IBeaconProxyFactory(getGasRelayPaymasterFactory()).getCanonicalLib()
            ).trustedForwarder();
    }
}

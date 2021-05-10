// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../interfaces/IAaveProtocolDataProvider.sol";
import "./utils/PeggedDerivativesPriceFeedBase.sol";

/// @title AavePriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Aave
contract AavePriceFeed is PeggedDerivativesPriceFeedBase {
    address private immutable PROTOCOL_DATA_PROVIDER;

    constructor(address _fundDeployer, address _protocolDataProvider)
        public
        PeggedDerivativesPriceFeedBase(_fundDeployer)
    {
        PROTOCOL_DATA_PROVIDER = _protocolDataProvider;
    }

    function __validateDerivative(address _derivative, address _underlying) internal override {
        super.__validateDerivative(_derivative, _underlying);

        (address aTokenAddress, , ) = IAaveProtocolDataProvider(PROTOCOL_DATA_PROVIDER)
            .getReserveTokensAddresses(_underlying);

        require(
            aTokenAddress == _derivative,
            "__validateDerivative: Invalid aToken or token provided"
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `PROTOCOL_DATA_PROVIDER` variable value
    /// @return protocolDataProvider_ The `PROTOCOL_DATA_PROVIDER` variable value
    function getProtocolDataProvider() external view returns (address protocolDataProvider_) {
        return PROTOCOL_DATA_PROVIDER;
    }
}

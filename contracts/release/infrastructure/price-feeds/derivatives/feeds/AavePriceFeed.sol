// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../interfaces/IAaveProtocolDataProvider.sol";
import "../IDerivativePriceFeed.sol";
import "./utils/PeggedDerivativesPriceFeedBase.sol";

/// @title AavePriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for Aave
contract AavePriceFeed is IDerivativePriceFeed, PeggedDerivativesPriceFeedBase {
    address private immutable AAVE_PROTOCOL_DATA_PROVIDER;

    constructor(address _dispatcher, address _aaveProtocolDataProvider)
        public
        PeggedDerivativesPriceFeedBase(_dispatcher)
    {
        AAVE_PROTOCOL_DATA_PROVIDER = _aaveProtocolDataProvider;
    }

    function __validateDerivative(address _derivative, address _underlying) internal override {
        super.__validateDerivative(_derivative, _underlying);

        (address aTokenAddress, , ) = IAaveProtocolDataProvider(AAVE_PROTOCOL_DATA_PROVIDER)
            .getReserveTokensAddresses(_underlying);

        require(
            aTokenAddress == _derivative,
            "__validateDerivative: Invalid aToken or token provided"
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `AAVE_PROTOCOL_DATA_PROVIDER` variable value
    /// @return aaveProtocolDataProvider_ The `AAVE_PROTOCOL_DATA_PROVIDER` variable value
    function getAaveProtocolDataProvider()
        external
        view
        returns (address aaveProtocolDataProvider_)
    {
        return AAVE_PROTOCOL_DATA_PROVIDER;
    }
}

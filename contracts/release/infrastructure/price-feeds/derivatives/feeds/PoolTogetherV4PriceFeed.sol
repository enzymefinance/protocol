// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../interfaces/IPoolTogetherV4PrizePool.sol";
import "../../../../interfaces/IPoolTogetherV4Ticket.sol";
import "./utils/PeggedDerivativesPriceFeedBase.sol";

/// @title PoolTogetherV4PriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for PoolTogether (v4)
contract PoolTogetherV4PriceFeed is PeggedDerivativesPriceFeedBase {
    constructor(address _fundDeployer) public PeggedDerivativesPriceFeedBase(_fundDeployer) {}

    function __validateDerivative(address _derivative, address _underlying) internal override {
        super.__validateDerivative(_derivative, _underlying);

        address controller = IPoolTogetherV4Ticket(_derivative).controller();
        address prizePoolAsset = IPoolTogetherV4PrizePool(controller).getToken();

        require(
            prizePoolAsset == _underlying,
            "__validateDerivative: Invalid ptToken or token provided"
        );
    }
}

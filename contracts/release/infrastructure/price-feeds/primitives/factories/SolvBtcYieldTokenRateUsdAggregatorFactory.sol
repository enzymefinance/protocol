// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {SolvBtcYieldTokenRateUsdAggregator} from "../SolvBtcYieldTokenRateUsdAggregator.sol";

/// @title SolvBtcYieldTokenRateUsdAggregatorFactory Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Factory for SolvBtcYieldTokenRateUsdAggregator
contract SolvBtcYieldTokenRateUsdAggregatorFactory {
    event InstanceDeployed(address instanceAddress);

    function deploy(address _solvBtcUsdAggregatorAddress, address _solvBtcYieldTokenAddress) external {
        address instanceAddress =
            address(new SolvBtcYieldTokenRateUsdAggregator(_solvBtcUsdAggregatorAddress, _solvBtcYieldTokenAddress));

        emit InstanceDeployed(instanceAddress);
    }
}

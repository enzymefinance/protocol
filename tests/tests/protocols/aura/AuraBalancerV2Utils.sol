// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAuraBalancerV2LpStakingWrapperFactory} from
    "tests/interfaces/internal/IAuraBalancerV2LpStakingWrapperFactory.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";

abstract contract AuraBalancerV2Utils is AddOnUtilsBase {
    address internal constant ETHEREUM_BOOSTER_ADDRESS = 0xA57b8d98dAE62B26Ec3bcC4a365338157060B234;

    // Pools: Composable Stable
    // USDC-DAI-USDT
    uint256 internal constant ETHEREUM_USDC_DAI_USDT_POOL_PID = 76;

    function deployStakingWrapperFactory(IDispatcher _dispatcher)
        internal
        returns (IAuraBalancerV2LpStakingWrapperFactory stakingWrapperFactory_)
    {
        bytes memory args = abi.encode(_dispatcher, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_BAL, ETHEREUM_AURA);

        return IAuraBalancerV2LpStakingWrapperFactory(deployCode("AuraBalancerV2LpStakingWrapperFactory.sol", args));
    }
}

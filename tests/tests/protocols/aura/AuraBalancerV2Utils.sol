// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAuraBalancerV2LpStakingWrapperFactory} from
    "tests/interfaces/internal/IAuraBalancerV2LpStakingWrapperFactory.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";

address constant ETHEREUM_BOOSTER_ADDRESS = 0xA57b8d98dAE62B26Ec3bcC4a365338157060B234;

// Pools: Composable Stable
// USDC-DAI-USDT
uint256 constant ETHEREUM_USDC_DAI_USDT_POOL_PID = 76;

// Pools: Misc Stable
// stETH
uint256 constant ETHEREUM_STETH_POOL_PID = 115;

abstract contract AuraBalancerV2Utils is AddOnUtilsBase {
    function deployAuraStakingWrapperLib(IAuraBalancerV2LpStakingWrapperFactory _factory)
        internal
        returns (address libAddress_)
    {
        bytes memory args = abi.encode(_factory, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_BAL, ETHEREUM_AURA);

        return deployCode("AuraBalancerV2LpStakingWrapperLib.sol", args);
    }

    function deployAuraStakingWrapperFactory(IDispatcher _dispatcher)
        internal
        returns (IAuraBalancerV2LpStakingWrapperFactory stakingWrapperFactory_)
    {
        bytes memory args = abi.encode(_dispatcher, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_BAL, ETHEREUM_AURA);

        stakingWrapperFactory_ =
            IAuraBalancerV2LpStakingWrapperFactory(deployCode("AuraBalancerV2LpStakingWrapperFactory.sol", args));

        // Deploy and upgrade to the latest version of the wrapper lib
        address lib = deployAuraStakingWrapperLib(stakingWrapperFactory_);
        stakingWrapperFactory_.setCanonicalLib(lib);
    }
}

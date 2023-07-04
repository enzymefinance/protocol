// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IConvexCurveLpStakingWrapperFactory} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperFactory.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";

abstract contract ConvexUtils is AddOnUtilsBase {
    address internal constant ETHEREUM_BOOSTER_ADDRESS = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

    // Pools
    uint256 internal constant ETHEREUM_AAVE_POOL_PRE_STASH_PID = 24;
    uint256 internal constant ETHEREUM_STETH_NG_POOL_POST_STASH_PID = 177;

    function deployStakingWrapperLib(IConvexCurveLpStakingWrapperFactory _factory)
        internal
        returns (address libAddress_)
    {
        bytes memory args = abi.encode(_factory, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_CRV, ETHEREUM_CVX);

        return deployCode("ConvexCurveLpStakingWrapperLib.sol", args);
    }

    function deployStakingWrapperFactory(IDispatcher _dispatcher)
        internal
        returns (IConvexCurveLpStakingWrapperFactory stakingWrapperFactory_)
    {
        bytes memory args = abi.encode(_dispatcher, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_CRV, ETHEREUM_CVX);

        stakingWrapperFactory_ =
            IConvexCurveLpStakingWrapperFactory(deployCode("ConvexCurveLpStakingWrapperFactory.sol", args));

        // Deploy and upgrade to the latest version of the wrapper lib
        address lib = deployStakingWrapperLib(stakingWrapperFactory_);
        stakingWrapperFactory_.setCanonicalLib(lib);
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IConvexBaseRewardPool} from "tests/interfaces/external/IConvexBaseRewardPool.sol";
import {IConvexBooster} from "tests/interfaces/external/IConvexBooster.sol";

import {IConvexCurveLpStakingWrapperFactory} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperFactory.sol";
import {IConvexCurveLpStakingWrapperLib} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperLib.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";

address constant ETHEREUM_BOOSTER_ADDRESS = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

// Pools
uint256 constant ETHEREUM_AAVE_POOL_PRE_STASH_PID = 24;
uint256 constant ETHEREUM_STETH_NG_POOL_POST_STASH_PID = 177;

abstract contract ConvexUtils is AddOnUtilsBase {
    // Adds an extra reward pool (not a token or stashToken) to Convex's base reward pool
    function addExtraRewardPoolToConvexPool(IConvexBooster _booster, uint256 _pid, address _extraRewardPoolAddress)
        internal
    {
        // Add the extra reward pool to the Convex base reward pool
        IConvexBaseRewardPool baseRewardPool = IConvexBaseRewardPool(_booster.poolInfo(_pid).crvRewards);

        vm.prank(baseRewardPool.rewardManager());
        baseRewardPool.addExtraReward(_extraRewardPoolAddress);
    }

    function deployConvexStakingWrapperLib(IConvexCurveLpStakingWrapperFactory _factory)
        internal
        returns (address libAddress_)
    {
        bytes memory args = abi.encode(_factory, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_CRV, ETHEREUM_CVX);

        return deployCode("ConvexCurveLpStakingWrapperLib.sol", args);
    }

    function deployConvexStakingWrapperFactory(IDispatcher _dispatcher)
        internal
        returns (IConvexCurveLpStakingWrapperFactory stakingWrapperFactory_)
    {
        // Initial _implementation value is empty, because currently the lib must be deployed after the factory
        bytes memory args = abi.encode(_dispatcher, address(0));

        stakingWrapperFactory_ =
            IConvexCurveLpStakingWrapperFactory(deployCode("ConvexCurveLpStakingWrapperFactory.sol", args));

        // Deploy and upgrade to the latest version of the wrapper lib
        address lib = deployConvexStakingWrapperLib(stakingWrapperFactory_);

        vm.prank(stakingWrapperFactory_.getOwner());
        stakingWrapperFactory_.setImplementation(lib);
    }
}

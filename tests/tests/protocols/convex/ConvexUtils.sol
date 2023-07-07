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
    // Adds a bogus ERC20-incompatible reward token to the staking wrapper
    function addBadRewardTokenToStakingWrapper(IConvexCurveLpStakingWrapperLib _wrapper)
        internal
        returns (address badRewardTokenAddress_)
    {
        badRewardTokenAddress_ = makeAddr("addBadRewardTokenToStakingWrapper: BadRewardToken");

        // Storage slot of `address[] rewardTokens` is `8`
        bytes32 rewardTokensSlot = bytes32(uint256(8));
        storeNewArrayItemAtSlot({
            _storageContract: address(_wrapper),
            _arraySlot: rewardTokensSlot,
            _newItem: badRewardTokenAddress_
        });
    }

    // Adds a reward token to Convex's reward pool
    function addExtraRewardTokenToConvexPool(IConvexBooster _booster, uint256 _pid, address _extraRewardTokenAddress)
        internal
    {
        // Add the extra reward pool to the Convex base reward pool
        IConvexBaseRewardPool baseRewardPool = IConvexBaseRewardPool(_booster.poolInfo(_pid).crvRewards);

        vm.prank(baseRewardPool.rewardManager());
        baseRewardPool.addExtraReward(_extraRewardTokenAddress);
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
        bytes memory args = abi.encode(_dispatcher, ETHEREUM_BOOSTER_ADDRESS, ETHEREUM_CRV, ETHEREUM_CVX);

        stakingWrapperFactory_ =
            IConvexCurveLpStakingWrapperFactory(deployCode("ConvexCurveLpStakingWrapperFactory.sol", args));

        // Deploy and upgrade to the latest version of the wrapper lib
        address lib = deployConvexStakingWrapperLib(stakingWrapperFactory_);
        stakingWrapperFactory_.setCanonicalLib(lib);
    }
}

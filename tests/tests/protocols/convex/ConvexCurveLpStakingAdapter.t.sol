// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {CurveAndConvexPoolTest} from "tests/tests/protocols/curve/CurveLiquidityAdapter.t.sol";
import {LidoUtils} from "tests/tests/protocols/lido/LidoUtils.sol";
import {LENDING_POOL_ADDRESS_ETHEREUM as ETHEREUM_AAVE_V2_POOL_ADDRESS} from
    "tests/utils/protocols/aave/AaveV2Utils.sol";
import {
    ConvexUtils,
    ETHEREUM_AAVE_POOL_PRE_STASH_PID,
    ETHEREUM_STETH_NG_POOL_POST_STASH_PID
} from "tests/tests/protocols/convex/ConvexUtils.sol";

import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";

import {IConvexCurveLpStakingWrapperFactory} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperFactory.sol";
import {IConvexCurveLpStakingWrapperLib} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperLib.sol";
import {IIntegrationAdapter} from "tests/interfaces/internal/IIntegrationAdapter.sol";

abstract contract EthereumPoolTest is CurveAndConvexPoolTest, ConvexUtils {
    uint256 internal convexPoolPid;

    function setUp() public virtual override {
        setUpMainnetEnvironment();

        isConvex = true;
        crvToken = IERC20(ETHEREUM_CRV);

        // Deploy the price feed
        priceFeed = deployPriceFeed({
            _fundDeployer: core.release.fundDeployer,
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: ETHEREUM_POOL_OWNER_ADDRESS,
            _virtualPriceDeviationThreshold: BPS_ONE_PERCENT
        });

        // Deploy the staking wrapper factory and wrapped staking token
        IConvexCurveLpStakingWrapperFactory stakingWrapperFactory =
            deployConvexStakingWrapperFactory({_dispatcher: core.persistent.dispatcher});
        stakingToken = IERC20(stakingWrapperFactory.deploy(convexPoolPid));

        // Add the staking token to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(stakingToken),
            _skipIfRegistered: true
        });

        // Deploy the adapter
        adapter = IIntegrationAdapter(__deployAdapter(stakingWrapperFactory));

        // Run common setup after all other setup
        super.setUp();
    }

    function __deployAdapter(IConvexCurveLpStakingWrapperFactory _stakingWrapperFactory)
        internal
        returns (address adapterAddress_)
    {
        bytes memory args = abi.encode(
            core.release.integrationManager, priceFeed, wrappedNativeToken, _stakingWrapperFactory, NATIVE_ASSET_ADDRESS
        );
        return deployCode("ConvexCurveLpStakingAdapter.sol", args);
    }
}

// ACTUAL TESTS, RUN PER-POOL

// Uses token directly as extra rewards
contract EthereumPreStashAavePoolTest is EthereumPoolTest {
    using SafeERC20 for IERC20;

    function increaseTokenBalance(IERC20 _token, address _to, uint256 _amount) internal override {
        // Sniff out aTokens
        (bool success, bytes memory returnData) =
            address(_token).staticcall(abi.encodeWithSelector(IAaveAToken.UNDERLYING_ASSET_ADDRESS.selector));

        if (success) {
            // case: aToken

            // TODO: merge with AaveUtils logic

            IERC20 underlying = IERC20(abi.decode(returnData, (address)));

            // Increase underlying balance (allowing recursion as necessary)
            increaseTokenBalance(underlying, _to, _amount);

            // Deposit underlying into Aave
            vm.startPrank(_to);
            // safeApprove() required for USDT
            underlying.safeApprove(ETHEREUM_AAVE_V2_POOL_ADDRESS, _amount);
            IAaveV2LendingPool(ETHEREUM_AAVE_V2_POOL_ADDRESS).deposit(address(underlying), _amount, _to, 0);
            vm.stopPrank();
        } else {
            // case: non-aToken

            // Only if not aToken do we call the underlying function logic
            super.increaseTokenBalance(_token, _to, _amount);
        }
    }

    function setUp() public override {
        // Define pool before all other setup
        poolAddress = ETHEREUM_AAVE_POOL_ADDRESS;
        lpToken = IERC20(ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS);
        convexPoolPid = ETHEREUM_AAVE_POOL_PRE_STASH_PID;

        // Run common setup
        super.setUp();
    }
}

// Uses a StashToken as extra rewards
contract EthereumPostStashStethNgPoolTest is EthereumPoolTest, LidoUtils {
    function increaseTokenBalance(IERC20 _token, address _to, uint256 _amount) internal override {
        if (address(_token) == ETHEREUM_STETH) {
            increaseStethBalance({_to: _to, _amount: _amount});
        } else {
            super.increaseTokenBalance(_token, _to, _amount);
        }
    }

    function setUp() public override {
        // Define pool before all other setup
        poolAddress = ETHEREUM_STETH_NG_POOL_ADDRESS;
        lpToken = IERC20(ETHEREUM_STETH_NG_POOL_LP_TOKEN_ADDRESS);
        convexPoolPid = ETHEREUM_STETH_NG_POOL_POST_STASH_PID;

        // Run common setup
        super.setUp();

        // Confirm that the reward tokens were registered as-expected
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(address(stakingToken));
        address[] memory rewardTokens = wrapper.getRewardTokens();
        // Only 2 reward tokens: CRV, CVX; the stash token is CVX, which gets skipped
        assertEq(rewardTokens.length, 2, "unexpected reward tokens count");

        // Add a bogus ERC20-incompatible reward token to the wrapper,
        // just to confirm that it doesn't interfere with any processes
        addBadRewardTokenToStakingWrapper(wrapper);

        assertEq(wrapper.getRewardTokens().length, rewardTokens.length + 1, "bad token not added");
    }
}

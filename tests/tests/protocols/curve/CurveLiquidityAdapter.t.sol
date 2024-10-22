// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {ICurveLiquidityAdapterBase as ICurveLiquidityAdapterBaseProd} from
    "contracts/release/extensions/integration-manager/integrations/utils/interfaces/ICurveLiquidityAdapterBase.sol";

import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";

import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";
import {ICurveGaugeController} from "tests/interfaces/external/ICurveGaugeController.sol";
import {ICurveLiquidityPool} from "tests/interfaces/external/ICurveLiquidityPool.sol";
import {ICurveMinter} from "tests/interfaces/external/ICurveMinter.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {ICurveLiquidityAdapter} from "tests/interfaces/internal/ICurveLiquidityAdapter.sol";
import {ICurvePriceFeed} from "tests/interfaces/internal/ICurvePriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IIntegrationAdapter} from "tests/interfaces/internal/IIntegrationAdapter.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

import {CurveUtils} from "./CurveUtils.sol";

// TODO: test underlyings for all relevant pools
// TODO: consider switching to fuzz tests for cases where a subset of tokens can be lent or redeemed for
// TODO: add tests that are only relevant to Curve (lend() and redeem())
// TODO: add negative (failure) test cases and any other missing coverage

abstract contract PoolTestBase is IntegrationTest, CurveUtils {
    using AddressArrayLib for address[];

    IIntegrationAdapter internal adapter;
    ICurvePriceFeed internal priceFeed;

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    address[] internal poolAssetAddresses;
    address[] internal poolUnderlyingAddresses;

    // Set by child contract
    EnzymeVersion internal version;

    // Vars defined by child contract
    bool internal isConvex;
    IERC20 internal crvToken;
    address internal poolAddress;
    IERC20 internal lpToken;
    IERC20 internal stakingToken;

    function setUp() public virtual override {
        // Validate required vars are set
        require(address(crvToken) != address(0), "setUp: crvToken not set");
        require(address(poolAddress) != address(0), "setUp: poolAddress not set");
        require(address(lpToken) != address(0), "setUp: lpToken not set");
        // isConvex can be empty (false)
        // stakingToken can be empty (no staking token)

        // Create fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Store pool assets
        poolAssetAddresses = __getPoolAssets({_pool: poolAddress, _useUnderlying: false});
        poolUnderlyingAddresses = __getPoolAssets({_pool: poolAddress, _useUnderlying: true});

        // Add all pool assets to asset universe to make them receivable
        address[] memory tokensToRegister = poolAssetAddresses.mergeArray(poolUnderlyingAddresses);
        // If v4, register incoming asset to pass the asset universe validation
        if (version == EnzymeVersion.V4) {
            v4AddPrimitivesWithTestAggregator({_tokenAddresses: tokensToRegister, _skipIfRegistered: true});
        }
        // lpToken and stakingToken must be registered on the CurvePriceFeed
        // _invariantProxyAssets and _reentrantVirtualPrices are arbitrary
        // _gaugeTokens is not needed for Convex
        vm.prank(IFundDeployer(getFundDeployerAddressForVersion(version)).getOwner());
        priceFeed.addPools({
            _pools: toArray(poolAddress),
            _invariantProxyAssets: toArray(address(getCoreToken("USD"))),
            _reentrantVirtualPrices: toArray(true),
            _lpTokens: toArray(address(lpToken)),
            _gaugeTokens: isConvex ? toArray(address(0)) : toArray(address(stakingToken))
        });
        // Convex tests will register its own stakingToken
        addDerivatives({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddresses: isConvex ? toArray(address(lpToken)) : toArray(address(lpToken), address(stakingToken)),
            _priceFeedAddresses: isConvex ? toArray(address(priceFeed)) : toArray(address(priceFeed), address(priceFeed)),
            _skipIfRegistered: false
        });
    }

    // ACTION HELPERS

    function __claimRewards() internal {
        bytes memory actionArgs = abi.encode(address(stakingToken));

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICurveLiquidityAdapter.claimRewards.selector,
            _actionArgs: actionArgs
        });
    }

    function __lendAndStake(
        uint256[] memory _orderedOutgoingAssetAmounts,
        uint256 _minIncomingStakingTokenAmount,
        bool _useUnderlyings
    ) internal {
        bytes memory actionArgs = abi.encode(
            poolAddress,
            _orderedOutgoingAssetAmounts,
            address(stakingToken),
            _minIncomingStakingTokenAmount,
            _useUnderlyings
        );

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICurveLiquidityAdapter.lendAndStake.selector,
            _actionArgs: actionArgs
        });
    }

    function __stake(uint256 _amount) internal {
        bytes memory actionArgs = abi.encode(poolAddress, address(stakingToken), _amount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICurveLiquidityAdapter.stake.selector,
            _actionArgs: actionArgs
        });
    }

    function __unstake(uint256 _amount) internal {
        bytes memory actionArgs = abi.encode(poolAddress, address(stakingToken), _amount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICurveLiquidityAdapter.unstake.selector,
            _actionArgs: actionArgs
        });
    }

    function __unstakeAndRedeem(
        uint256 _outgoingStakingTokenAmount,
        bool _useUnderlyings,
        ICurveLiquidityAdapterBaseProd.RedeemType _redeemType,
        bytes memory _incomingAssetsData
    ) internal {
        bytes memory actionArgs = abi.encode(
            poolAddress,
            address(stakingToken),
            _outgoingStakingTokenAmount,
            _useUnderlyings,
            _redeemType,
            _incomingAssetsData
        );

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: ICurveLiquidityAdapter.unstakeAndRedeem.selector,
            _actionArgs: actionArgs
        });
    }

    function __encodeIncomingAssetsDataRedeemOneCoin(uint256 _incomingAssetPoolIndex, uint256 _minIncomingAssetAmount)
        internal
        pure
        returns (bytes memory incomingAssetsData_)
    {
        return abi.encode(_incomingAssetPoolIndex, _minIncomingAssetAmount);
    }

    function __encodeIncomingAssetsDataRedeemStandard(uint256[] memory _orderedMinIncomingAssetAmounts)
        internal
        pure
        returns (bytes memory incomingAssetsData_)
    {
        return abi.encode(_orderedMinIncomingAssetAmounts);
    }

    // MISC HELPERS

    // Copied from CurveLiquidityAdapterBase, modified to use `wrappedNativeToken` from config
    function __castWrappedIfNativeAsset(address _tokenOrNativeAsset) internal view returns (address tokenAddress_) {
        if (_tokenOrNativeAsset == NATIVE_ASSET_ADDRESS) {
            return address(wrappedNativeToken);
        }

        return _tokenOrNativeAsset;
    }

    // Copied from CurveLiquidityAdapterBase, modified to silently catch out-of-bounds index
    function __getPoolAsset(address _pool, uint256 _index, bool _useUnderlying)
        internal
        view
        returns (address asset_)
    {
        if (_useUnderlying) {
            try ICurveLiquidityPool(_pool).underlying_coins(_index) returns (address underlyingCoin) {
                asset_ = underlyingCoin;
            } catch {
                try ICurveLiquidityPool(_pool).underlying_coins(int128(int256(_index))) returns (address underlyingCoin)
                {
                    asset_ = underlyingCoin;
                } catch {}
            }
        } else {
            try ICurveLiquidityPool(_pool).coins(_index) returns (address coin) {
                asset_ = coin;
            } catch {
                try ICurveLiquidityPool(_pool).coins(int128(int256(_index))) returns (address coin) {
                    asset_ = coin;
                } catch {}
            }
        }

        return __castWrappedIfNativeAsset(asset_);
    }

    // Discover token count by grabbing new tokens until empty
    function __getPoolAssets(address _pool, bool _useUnderlying)
        internal
        view
        returns (address[] memory assetAddresses_)
    {
        uint256 index;
        bool end;
        while (!end) {
            address assetAddress = __getPoolAsset({_pool: _pool, _index: index, _useUnderlying: _useUnderlying});
            if (assetAddress == address(0)) {
                end = true;
            } else {
                assetAddresses_ = assetAddresses_.addItem(assetAddress);
                index++;
            }
        }

        return assetAddresses_;
    }

    // Quickly identify if a test is Curve on mainnet, or Convex/sidechain
    function __isCurveMainnetTest() internal view returns (bool isBalancerMainnet_) {
        return !isConvex && address(crvToken) == ETHEREUM_CRV;
    }
}

abstract contract CurveAndConvexPoolTest is PoolTestBase {
    function test_claimRewards_success() public {
        // Setup rewards claiming on the Minter (mainnet Curve tests only)
        if (__isCurveMainnetTest()) {
            // Approve adapter to call Minter on behalf of the vault
            // for V4 fork it is already registered
            if (version != EnzymeVersion.V4) {
                registerVaultCall({
                    _fundDeployer: IFundDeployer(getFundDeployerAddressForVersion(version)),
                    _contract: ETHEREUM_MINTER_ADDRESS,
                    _selector: ICurveMinter.toggle_approve_mint.selector
                });
            }
            vm.prank(fundOwner);
            IComptrollerLib(comptrollerProxyAddress).vaultCallOnContract({
                _contract: ETHEREUM_MINTER_ADDRESS,
                _selector: ICurveMinter.toggle_approve_mint.selector,
                _encodedArgs: abi.encode(address(adapter))
            });

            // Make sure the gauge has some weight so it earns CRV rewards via the Minter
            // TODO: unclear on the mechanics of this, but it works with the limited pool set here.
            // Likely need to do/consider something else when changing the weight of a gauge.
            uint256 prevGaugeWeight =
                ICurveGaugeController(ETHEREUM_GAUGE_CONTROLLER_ADDRESS).get_gauge_weight(address(stakingToken));
            if (prevGaugeWeight == 0) {
                uint256 totalWeight = ICurveGaugeController(ETHEREUM_GAUGE_CONTROLLER_ADDRESS).get_total_weight();
                vm.prank(ETHEREUM_GAUGE_CONTROLLER_ADMIN_ADDRESS);
                ICurveGaugeController(ETHEREUM_GAUGE_CONTROLLER_ADDRESS).change_gauge_weight({
                    _gauge: address(stakingToken),
                    _weight: totalWeight / 100
                });
            }
        }

        // Seed the vault with lpToken and stake them to start accruing rewards
        uint256 stakingTokenBalance = assetUnit(stakingToken) * 1000;
        increaseTokenBalance({_token: lpToken, _to: vaultProxyAddress, _amount: stakingTokenBalance});
        __stake(stakingTokenBalance);

        // Warp ahead in time to accrue significant rewards
        vm.warp(block.timestamp + SECONDS_ONE_DAY * 30);

        // Seed the staking token with some CRV for rewards (Curve sidechains and Convex)
        // Incidentally, this also tests the extra rewards are claimed correctly, since CRV is treated as an extra reward on side-chains
        if (!__isCurveMainnetTest()) {
            increaseTokenBalance({_token: crvToken, _to: address(stakingToken), _amount: assetUnit(crvToken) * 10_000});
        }

        vm.recordLogs();

        // Claim rewards
        __claimRewards();

        // Test parseAssetsForAction encoding.
        // All should be empty.
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.None),
            _spendAssets: new address[](0),
            _maxSpendAssetAmounts: new uint256[](0),
            _incomingAssets: new address[](0),
            _minIncomingAssetAmounts: new uint256[](0)
        });

        // Assert vault balances of reward tokens have increased
        // TODO: set extra reward token
        assertTrue(crvToken.balanceOf(vaultProxyAddress) > 0, "no bal token received");
    }

    function test_lendAndStake_success() public {
        // Define arbitrary amounts of spend assets where only the first and last indexes are non-zero,
        // to test that the adapter can handle some assets being zero (some pools will have 2 assets, some 3).
        // This will actually guarantee coverage of native asset handling, so long as one such pool has 2 assets.
        uint256 finalIndex = poolAssetAddresses.length - 1;
        uint256[] memory orderedOutgoingAssetAmounts = new uint256[](poolAssetAddresses.length);
        orderedOutgoingAssetAmounts[0] = assetUnit(IERC20(poolAssetAddresses[0])) * 3;
        orderedOutgoingAssetAmounts[finalIndex] = assetUnit(IERC20(poolAssetAddresses[finalIndex])) * 4;
        uint256 minIncomingStakingTokenAmount = 123;

        address[] memory spendAssetAddresses = toArray(poolAssetAddresses[0], poolAssetAddresses[finalIndex]);
        uint256[] memory spendAssetAmounts =
            toArray(orderedOutgoingAssetAmounts[0], orderedOutgoingAssetAmounts[finalIndex]);

        // Seed the vault with exact needed spend asset amounts
        for (uint256 i; i < spendAssetAddresses.length; i++) {
            increaseTokenBalance({
                _token: IERC20(spendAssetAddresses[i]),
                _to: vaultProxyAddress,
                _amount: spendAssetAmounts[i]
            });
        }

        vm.recordLogs();

        __lendAndStake({
            _orderedOutgoingAssetAmounts: orderedOutgoingAssetAmounts,
            _minIncomingStakingTokenAmount: minIncomingStakingTokenAmount,
            _useUnderlyings: false
        });

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: spendAssetAddresses,
            _maxSpendAssetAmounts: spendAssetAmounts,
            _incomingAssets: toArray(address(stakingToken)),
            _minIncomingAssetAmounts: toArray(minIncomingStakingTokenAmount)
        });

        // Received staking token amount should be non-zero
        assertTrue(stakingToken.balanceOf(vaultProxyAddress) > 0, "incorrect final staking token balance");
        // The full amounts of the spend assets should have been used
        for (uint256 i; i < spendAssetAddresses.length; i++) {
            assertEq(
                IERC20(spendAssetAddresses[i]).balanceOf(vaultProxyAddress), 0, "incorrect final spend asset balance"
            );
        }
    }

    function test_stake_success() public {
        // Seed the vault with unstaked lpToken
        uint256 preTxLpTokenBalance = assetUnit(lpToken) * 1000;
        increaseTokenBalance({_token: lpToken, _to: vaultProxyAddress, _amount: preTxLpTokenBalance});

        uint256 lpTokenToStake = preTxLpTokenBalance / 5;

        vm.recordLogs();

        __stake(lpTokenToStake);

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(lpToken)),
            _maxSpendAssetAmounts: toArray(lpTokenToStake),
            _incomingAssets: toArray(address(stakingToken)),
            _minIncomingAssetAmounts: toArray(lpTokenToStake)
        });

        assertEq(stakingToken.balanceOf(vaultProxyAddress), lpTokenToStake, "incorrect final staking token balance");
        assertEq(
            lpToken.balanceOf(vaultProxyAddress),
            preTxLpTokenBalance - lpTokenToStake,
            "incorrect final lpToken balance"
        );
    }

    function test_unstake_success() public {
        // Seed the vault with lpToken and stake them
        uint256 preTxLpTokenBalance = assetUnit(stakingToken) * 1000;
        increaseTokenBalance({_token: lpToken, _to: vaultProxyAddress, _amount: preTxLpTokenBalance});
        __stake(preTxLpTokenBalance);

        uint256 lpTokenToUnstake = preTxLpTokenBalance / 5;

        vm.recordLogs();

        __unstake(lpTokenToUnstake);

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: isConvex
                ? uint8(IIntegrationManagerProd.SpendAssetsHandleType.Approve)
                : uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(stakingToken)),
            _maxSpendAssetAmounts: toArray(lpTokenToUnstake),
            _incomingAssets: toArray(address(lpToken)),
            _minIncomingAssetAmounts: toArray(lpTokenToUnstake)
        });

        assertEq(
            stakingToken.balanceOf(vaultProxyAddress),
            preTxLpTokenBalance - lpTokenToUnstake,
            "incorrect final staking token balance"
        );
        assertEq(lpToken.balanceOf(vaultProxyAddress), lpTokenToUnstake, "incorrect final lpToken balance");
    }

    function test_unstakeAndRedeem_successStandard() public {
        // Seed the vault with lpToken and stake them
        uint256 preTxLpTokenBalance = assetUnit(stakingToken) * 1000;
        increaseTokenBalance({_token: lpToken, _to: vaultProxyAddress, _amount: preTxLpTokenBalance});
        __stake(preTxLpTokenBalance);

        uint256 lpTokenToUnstake = preTxLpTokenBalance / 5;

        // Set arbitrary min incoming amounts and record pre-tx balances
        uint256[] memory preTxIncomingAssetBalances = new uint256[](poolAssetAddresses.length);
        uint256[] memory orderedMinIncomingAssetAmounts = new uint256[](poolAssetAddresses.length);
        uint256 nextMinIncomingAssetAmount = 123;
        for (uint256 i; i < orderedMinIncomingAssetAmounts.length; i++) {
            orderedMinIncomingAssetAmounts[i] = nextMinIncomingAssetAmount;
            nextMinIncomingAssetAmount *= 3;

            // Also, assert incoming tokens all start with a zero-balance
            preTxIncomingAssetBalances[i] = IERC20(poolAssetAddresses[i]).balanceOf(vaultProxyAddress);
        }

        vm.recordLogs();

        __unstakeAndRedeem({
            _outgoingStakingTokenAmount: lpTokenToUnstake,
            _useUnderlyings: false,
            _redeemType: ICurveLiquidityAdapterBaseProd.RedeemType.Standard,
            _incomingAssetsData: __encodeIncomingAssetsDataRedeemStandard({
                _orderedMinIncomingAssetAmounts: orderedMinIncomingAssetAmounts
            })
        });

        // Test parseAssetsForAction encoding
        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: isConvex
                ? uint8(IIntegrationManagerProd.SpendAssetsHandleType.Approve)
                : uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(stakingToken)),
            _maxSpendAssetAmounts: toArray(lpTokenToUnstake),
            _incomingAssets: poolAssetAddresses,
            _minIncomingAssetAmounts: orderedMinIncomingAssetAmounts
        });

        // Received token amounts should be non-zero
        for (uint256 i; i < poolAssetAddresses.length; i++) {
            assertTrue(
                IERC20(poolAssetAddresses[i]).balanceOf(vaultProxyAddress) > preTxIncomingAssetBalances[i],
                "incorrect final received token balance"
            );
        }
        // The exact stakingToken amount should have been used
        assertEq(
            stakingToken.balanceOf(vaultProxyAddress),
            preTxLpTokenBalance - lpTokenToUnstake,
            "incorrect final staking token balance"
        );
    }
}

abstract contract CurvePoolTest is CurveAndConvexPoolTest {
    function __deployAdapter(address _minterAddress) internal returns (address adapterAddress_) {
        // Validate required vars are set
        require(
            getIntegrationManagerAddressForVersion(version) != address(0), "__deployAdapter: integrationManager not set"
        );
        require(address(priceFeed) != address(0), "__deployAdapter: priceFeed not set");
        require(address(wrappedNativeToken) != address(0), "__deployAdapter: wrappedNativeToken not set");
        require(address(crvToken) != address(0), "__deployAdapter: crvToken not set");

        bytes memory args = abi.encode(
            getIntegrationManagerAddressForVersion(version),
            priceFeed,
            wrappedNativeToken,
            _minterAddress,
            crvToken,
            NATIVE_ASSET_ADDRESS
        );

        return deployCode("CurveLiquidityAdapter.sol", args);
    }

    // TODO: add Curve-only tests here
}

abstract contract EthereumCurvePoolTest is CurvePoolTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment();

        crvToken = IERC20(ETHEREUM_CRV);

        // Deploy the price feed
        priceFeed = deployPriceFeed({
            _fundDeployer: IFundDeployer(getFundDeployerAddressForVersion(version)),
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: ETHEREUM_POOL_OWNER_ADDRESS,
            _virtualPriceDeviationThreshold: BPS_ONE_PERCENT
        });

        // Deploy the adapter
        adapter = IIntegrationAdapter(__deployAdapter(ETHEREUM_MINTER_ADDRESS));

        // Run common setup
        super.setUp();
    }
}

abstract contract PolygonCurvePoolTest is CurvePoolTest {
    function setUp() public virtual override {
        setUpPolygonEnvironment();

        crvToken = IERC20(POLYGON_CRV);

        // Deploy the price feed
        priceFeed = deployPriceFeed({
            _fundDeployer: IFundDeployer(getFundDeployerAddressForVersion(version)),
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: POLYGON_POOL_OWNER_ADDRESS,
            _virtualPriceDeviationThreshold: BPS_ONE_PERCENT
        });

        // Deploy the adapter
        adapter = IIntegrationAdapter(__deployAdapter(address(0)));

        super.setUp();
    }
}

abstract contract ArbitrumCurvePoolTest is CurvePoolTest {
    function setUp() public virtual override {
        setUpArbitrumEnvironment();

        crvToken = IERC20(ARBITRUM_CRV);

        // Deploy the price feed
        priceFeed = deployPriceFeed({
            _fundDeployer: IFundDeployer(getFundDeployerAddressForVersion(version)),
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: ARBITRUM_POOL_OWNER_ADDRESS,
            _virtualPriceDeviationThreshold: BPS_ONE_PERCENT
        });

        // Deploy the adapter
        adapter = IIntegrationAdapter(__deployAdapter(address(0)));

        super.setUp();
    }
}

// ACTUAL TESTS, RUN PER-POOL

contract EthereumAavePoolTest is EthereumCurvePoolTest {
    using SafeERC20 for IERC20;

    function setUp() public virtual override {
        // Define pool before all other setup
        poolAddress = ETHEREUM_AAVE_POOL_ADDRESS;
        lpToken = IERC20(ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS);
        stakingToken = IERC20(ETHEREUM_AAVE_POOL_GAUGE_TOKEN_ADDRESS);

        super.setUp();
    }
}

contract EthereumStethNgPoolTest is EthereumCurvePoolTest {
    function setUp() public virtual override {
        // Define pool before all other setup
        poolAddress = ETHEREUM_STETH_NG_POOL_ADDRESS;
        lpToken = IERC20(ETHEREUM_STETH_NG_POOL_LP_TOKEN_ADDRESS);
        stakingToken = IERC20(ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS);

        super.setUp();
    }
}

contract PolygonAavePoolTest is PolygonCurvePoolTest {
    using SafeERC20 for IERC20;

    function setUp() public virtual override {
        // Define pool before all other setup
        poolAddress = POLYGON_AAVE_POOL_ADDRESS;
        lpToken = IERC20(POLYGON_AAVE_POOL_LP_TOKEN_ADDRESS);
        stakingToken = IERC20(POLYGON_AAVE_POOL_GAUGE_TOKEN_ADDRESS);

        super.setUp();
    }
}

// TODO: These tests assume that Curve pools have staking tokens, and only test the corresponding actions.
// There is no Arbitrum Curve pool that has a staking token, so these tests are not applicable.
// contract Arbitrum2PoolTest is ArbitrumCurvePoolTest {
//     using SafeERC20 for IERC20;

//     function setUp() public virtual override {
//         // Define pool before all other setup
//         poolAddress = ARBITRUM_2POOL_ADDRESS;
//         lpToken = IERC20(ARBITRUM_2POOL_LP_TOKEN_ADDRESS);
//         stakingToken = IERC20(address(0));

//         super.setUp();
//     }
// }

contract EthereumAavePoolTestV4 is EthereumAavePoolTest {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract EthereumStethNgPoolTestV4 is EthereumStethNgPoolTest {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract PolygonAavePoolTestV4 is PolygonAavePoolTest {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

// contract Arbitrum2PoolTestV4 is Arbitrum2PoolTest {
//     function setUp() public override {
//         version = EnzymeVersion.V4;

//         super.setUp();
//     }
// }

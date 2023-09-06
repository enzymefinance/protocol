// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IUniswapV3Factory} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Pool.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IArrakisV2Helper} from "tests/interfaces/external/IArrakisV2Helper.sol";
import {IArrakisV2Vault} from "tests/interfaces/external/IArrakisV2Vault.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IArrakisV2PriceFeed} from "tests/interfaces/internal/IArrakisV2PriceFeed.sol";

import {
    ETHEREUM_FACTORY_ADDRESS as ETHEREUM_UNISWAP_FACTORY_ADDRESS,
    POLYGON_FACTORY_ADDRESS as POLYGON_UNISWAP_FACTORY_ADDRESS,
    UniswapV3Utils
} from "tests/tests/protocols/uniswap/UniswapV3Utils.sol";
import {ARRAKIS_HELPER_ADDRESS, ETHEREUM_ARRAKIS_DAI_WETH, POLYGON_ARRAKIS_USDC_WETH} from "./ArrakisV2Utils.sol";

abstract contract ArrakisV2PriceFeedTestBase is IntegrationTest, UniswapV3Utils {
    IArrakisV2PriceFeed internal arrakisPriceFeed;
    IArrakisV2Helper internal arrakisHelper;
    IArrakisV2Vault internal arrakisVault;
    IUniswapV3Factory internal uniswapFactory;
    IERC20 internal token0;
    IERC20 internal token1;

    function setUp(address _arrakisHelperAddress, address _arrakisVaultAddress, address _uniV3FactoryAddress)
        internal
    {
        arrakisHelper = IArrakisV2Helper(_arrakisHelperAddress);
        arrakisVault = IArrakisV2Vault(_arrakisVaultAddress);
        uniswapFactory = IUniswapV3Factory(_uniV3FactoryAddress);

        arrakisPriceFeed = __deployPriceFeed({_uniV3FactoryAddress: _uniV3FactoryAddress});

        token0 = IERC20(arrakisVault.token0());
        token1 = IERC20(arrakisVault.token1());

        addDerivative({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(arrakisVault),
            _priceFeedAddress: address(arrakisPriceFeed),
            _skipIfRegistered: false
        });
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed(address _uniV3FactoryAddress) private returns (IArrakisV2PriceFeed) {
        bytes memory args = abi.encode(_uniV3FactoryAddress, core.release.valueInterpreter);
        address addr = deployCode("ArrakisV2PriceFeed.sol", args);
        return IArrakisV2PriceFeed(addr);
    }

    function test_calcUnderlyingValues_success() public {
        address[] memory uniPools = arrakisVault.getPools();

        // 1. To generate fees, make some trades in each Uni pool, in each direction
        for (uint256 i = 0; i < uniPools.length; i++) {
            uniswapV3DoNRoundTripSwaps({_pool: IUniswapV3Pool(uniPools[i]), _nSwaps: 100});
        }

        // 2. Update the asset universe price of assetA-to-assetB to be the exact currentTick of the average of the pools (weighted by liquidity).
        // This will allow us to do a near-exact comparison of the price feed's price vs. what a user actually receives from a redemption.

        IArrakisV2Helper.PositionLiquidity[] memory positionLiquidities =
            arrakisHelper.totalLiquidity(address(arrakisVault));

        uint256 weightedPoolPrice;
        if (positionLiquidities.length > 0) {
            uint256 totalLiquidity;
            for (uint256 i = 0; i < positionLiquidities.length; i++) {
                uint256 poolLiquidity = positionLiquidities[i].liquidity;
                address uniPool = uniswapFactory.getPool({
                    tokenA: address(token0),
                    tokenB: address(token1),
                    fee: positionLiquidities[i].range.feeTier
                });

                weightedPoolPrice += poolLiquidity * uniswapV3CalcPoolPrice(uniPool);
                totalLiquidity += poolLiquidity;
                if (i == uniPools.length - 1) {
                    // Weighted average of pool prices, weighted by provided liquidity
                    weightedPoolPrice /= totalLiquidity;
                }
            }
        } else {
            // If there is no active liquidity, just use the price of the first pool
            weightedPoolPrice = uniswapV3CalcPoolPrice(uniPools[0]);
        }

        registerPrimitivePairWithPrice({
            _valueInterpreter: core.release.valueInterpreter,
            _assetA: token0,
            _assetB: token1,
            _assetBAmountPerUnitA: weightedPoolPrice
        });

        // Define an arbitrary amount of arrakis tokens to redeem, and seed a third party with that amount
        address arrakisHolder = makeAddr("ArrakisHolder");
        uint256 arrakisTokensToRedeem = IERC20(address(arrakisVault)).totalSupply() / 5;
        increaseTokenBalance({_token: IERC20(address(arrakisVault)), _to: arrakisHolder, _amount: arrakisTokensToRedeem});

        // Record the price feed values prior to redeeming and assert the expected values that remain constant
        (address[] memory preRedeemUnderlyingAssetAddresses, uint256[] memory preRedeemUnderlyingAssetAmounts) =
        arrakisPriceFeed.calcUnderlyingValues({
            _derivative: address(arrakisVault),
            _derivativeAmount: arrakisTokensToRedeem
        });

        assertEq(preRedeemUnderlyingAssetAddresses.length, 2, "price feed token count != 2");
        assertEq(
            preRedeemUnderlyingAssetAddresses.length,
            preRedeemUnderlyingAssetAmounts.length,
            "price feed token and amount counts not equal"
        );
        assertEq(
            preRedeemUnderlyingAssetAddresses.length,
            preRedeemUnderlyingAssetAmounts.length,
            "price feed token and amount counts not equal"
        );
        assertEq(preRedeemUnderlyingAssetAddresses[0], address(token0), "unexpected price feed token0");
        assertEq(preRedeemUnderlyingAssetAddresses[1], address(token1), "unexpected price feed token1");

        // 3. Redeem the arrakis tokens

        vm.prank(arrakisHolder);
        arrakisVault.burn({_burnAmount: arrakisTokensToRedeem, _receiver: arrakisHolder});

        // The underlyings received should match the price feed closely
        {
            uint256 bufferPercentInWei = WEI_ONE_PERCENT / 100; // 1bps
            uint256 token0Redeemed = token0.balanceOf(arrakisHolder);
            assertApproxEqRel(
                token0Redeemed,
                preRedeemUnderlyingAssetAmounts[0],
                bufferPercentInWei,
                "unexpected token0 redeem amount"
            );
            uint256 token1Redeemed = token1.balanceOf(arrakisHolder);
            assertApproxEqRel(
                token1Redeemed,
                preRedeemUnderlyingAssetAmounts[1],
                bufferPercentInWei,
                "unexpected token1 redeem amount"
            );
        }

        // The price feed values should be the same as before
        {
            (address[] memory underlyingAssetAddresses, uint256[] memory underlyingAssetAmounts) = arrakisPriceFeed
                .calcUnderlyingValues({_derivative: address(arrakisVault), _derivativeAmount: arrakisTokensToRedeem});
            assertEq(underlyingAssetAddresses, preRedeemUnderlyingAssetAddresses, "post-redeem underlyings mismatch");
            assertApproxEqAbs(
                underlyingAssetAmounts[0], preRedeemUnderlyingAssetAmounts[0], 1, "post-redeem token0 amount mismatch"
            );
            assertApproxEqAbs(
                underlyingAssetAmounts[1], preRedeemUnderlyingAssetAmounts[1], 1, "post-redeem token1 amount mismatch"
            );
        }

        // 4. Push the Uniswap pools to be out-of-whack with the asset universe price.
        // The returned price of the price feed should be almost the same, but with newly-accrued fees from the trade.

        for (uint256 i = 0; i < uniPools.length; i++) {
            IUniswapV3Pool pool = IUniswapV3Pool(uniPools[i]);
            uint24 poolFee = pool.fee();

            // Push each pool by a substantial % of its token0 balance
            uint256 token0PoolBalance = token0.balanceOf(uniPools[i]);
            uint256 outgoingAssetAmount = token0PoolBalance / 10; // 10% of pool balance
            uniswapV3SimpleTradeRandomCaller({
                _outgoingAsset: token0,
                _outgoingAssetAmount: outgoingAssetAmount,
                _incomingAsset: token1,
                _poolFee: poolFee
            });

            // TODO: could assert that the tick has been pushed substantially
        }

        // The price feed values should be the same as its previous values, other than token0 due to fees accrued in the trade
        {
            (address[] memory underlyingAssetAddresses, uint256[] memory underlyingAssetAmounts) = arrakisPriceFeed
                .calcUnderlyingValues({_derivative: address(arrakisVault), _derivativeAmount: arrakisTokensToRedeem});
            assertEq(underlyingAssetAddresses, preRedeemUnderlyingAssetAddresses, "post-trade underlyings mismatch");
            assertApproxEqAbs(
                underlyingAssetAmounts[1], preRedeemUnderlyingAssetAmounts[1], 1, "post-trade token1 amount mismatch"
            );

            // TODO: this could be improved upon by considering the fees accrued in the new trade
            // e.g., could "collect" all the fees for the arrakis position and see how much token0 is leftover pro-rata vs. previously
            uint256 bufferPercentInWei = WEI_ONE_PERCENT / 10; // 0.1%
            assertApproxEqAbs(
                underlyingAssetAmounts[0],
                preRedeemUnderlyingAssetAmounts[0],
                bufferPercentInWei,
                "post-trade token0 amount mismatch"
            );
        }
    }
}

contract DaiWethEthereumTest is ArrakisV2PriceFeedTestBase {
    function setUp() public override {
        setUpMainnetEnvironment();
        setUp({
            _arrakisHelperAddress: ARRAKIS_HELPER_ADDRESS,
            _arrakisVaultAddress: ETHEREUM_ARRAKIS_DAI_WETH,
            _uniV3FactoryAddress: ETHEREUM_UNISWAP_FACTORY_ADDRESS
        });
    }
}

contract WmaticWethPolygonTest is ArrakisV2PriceFeedTestBase {
    function setUp() public override {
        setUpPolygonEnvironment();
        setUp({
            _arrakisHelperAddress: ARRAKIS_HELPER_ADDRESS,
            _arrakisVaultAddress: POLYGON_ARRAKIS_USDC_WETH,
            _uniV3FactoryAddress: POLYGON_UNISWAP_FACTORY_ADDRESS
        });
    }
}

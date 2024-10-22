// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IUniswapV2LiquidityAdapter} from "tests/interfaces/internal/IUniswapV2LiquidityAdapter.sol";
import {IUniswapV2PoolPriceFeed} from "tests/interfaces/internal/IUniswapV2PoolPriceFeed.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";
import {IUniswapV2Pair} from "tests/interfaces/external/IUniswapV2Pair.sol";
import {
    ETHEREUM_UNISWAP_V2_POOL_WETH_USDC,
    ETHEREUM_UNISWAP_V2_FACTORY,
    ETHEREUM_UNISWAP_V2_ROUTER,
    POLYGON_UNISWAP_V2_POOL_WMATIC_USDT,
    POLYGON_UNISWAP_V2_FACTORY,
    POLYGON_UNISWAP_V2_ROUTER,
    ARBITRUM_UNISWAP_V2_POOL_WETH_USDC,
    ARBITRUM_UNISWAP_V2_FACTORY,
    ARBITRUM_UNISWAP_V2_ROUTER,
    UniswapV2Utils
} from "./UniswapV2Utils.sol";

abstract contract UniswapV2LiquidityAdapterTestBase is IntegrationTest, UniswapV2Utils {
    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IUniswapV2LiquidityAdapter internal uniswapV2LiquidityAdapter;
    IUniswapV2PoolPriceFeed internal uniswapV2PoolPriceFeed;
    IUniswapV2Pair internal uniswapV2Pool;

    IERC20 internal token0;
    IERC20 internal token1;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        address _uniswapV2FactoryAddress,
        address _uniswapV2PoolAddress,
        address _uniswapV2RouterAddress
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId});

        version = _version;

        uniswapV2LiquidityAdapter = __deployAdapter({
            _integrationManagerAddress: getIntegrationManagerAddressForVersion(version),
            _uniswapV2FactoryAddress: _uniswapV2FactoryAddress,
            _uniswapV2RouterAddress: _uniswapV2RouterAddress
        });
        uniswapV2PoolPriceFeed = __deployPriceFeed({
            _fundDeployerAddress: getFundDeployerAddressForVersion(version),
            _valueInterpreterAddress: getValueInterpreterAddressForVersion(version),
            _uniswapV2FactoryAddress: _uniswapV2FactoryAddress
        });

        uniswapV2Pool = IUniswapV2Pair(_uniswapV2PoolAddress);
        token0 = IERC20(uniswapV2Pool.token0());
        token1 = IERC20(uniswapV2Pool.token1());

        // If v4, register incoming asset to pass the asset universe validation
        if (version == EnzymeVersion.V4) {
            address[] memory tokenAddresses = new address[](2);
            tokenAddresses[0] = address(token0);
            tokenAddresses[1] = address(token1);
            v4AddPrimitivesWithTestAggregator({_tokenAddresses: tokenAddresses, _skipIfRegistered: true});
        }

        // Add poolTokens to price feed
        vm.startPrank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());
        uniswapV2PoolPriceFeed.addPoolTokens({_poolTokens: toArray(address(uniswapV2Pool))});

        // Register derivatives
        addDerivative({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion({_version: _version})),
            _tokenAddress: address(uniswapV2Pool),
            _skipIfRegistered: true,
            _priceFeedAddress: address(uniswapV2PoolPriceFeed)
        });
        vm.stopPrank();

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Seed the vault with the underlying tokens
        increaseTokenBalance({_token: token0, _to: vaultProxyAddress, _amount: assetUnit(token0) * 31});
        increaseTokenBalance({_token: token1, _to: vaultProxyAddress, _amount: assetUnit(token1) * 33});
    }

    // DEPLOYMENT HELPERS
    function __deployAdapter(
        address _integrationManagerAddress,
        address _uniswapV2RouterAddress,
        address _uniswapV2FactoryAddress
    ) private returns (IUniswapV2LiquidityAdapter adapter_) {
        bytes memory args = abi.encode(_integrationManagerAddress, _uniswapV2RouterAddress, _uniswapV2FactoryAddress);
        address addr = deployCode("UniswapV2LiquidityAdapter.sol", args);
        return IUniswapV2LiquidityAdapter(addr);
    }

    function __deployPriceFeed(
        address _fundDeployerAddress,
        address _valueInterpreterAddress,
        address _uniswapV2FactoryAddress
    ) private returns (IUniswapV2PoolPriceFeed priceFeed_) {
        bytes memory args = abi.encode(_fundDeployerAddress, _valueInterpreterAddress, _uniswapV2FactoryAddress);
        address addr = deployCode("UniswapV2PoolPriceFeed.sol", args);
        return IUniswapV2PoolPriceFeed(addr);
    }

    // ACTION HELPERS

    function __lend(uint256[2] memory _maxOutgoingAssetAmounts) private {
        address[2] memory outgoingAssets = [address(token0), address(token1)];
        uint256[2] memory minOutgoingAssetAmounts = [uint256(0), uint256(0)];
        uint256 minIncomingAssetAmount = 0;
        bytes memory actionArgs =
            abi.encode(outgoingAssets, _maxOutgoingAssetAmounts, minOutgoingAssetAmounts, minIncomingAssetAmount);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(uniswapV2LiquidityAdapter),
            _selector: IUniswapV2LiquidityAdapter.lend.selector
        });
    }

    function __redeem(uint256 _outgoingAssetAmount) private {
        address[2] memory incomingAssets = [address(token0), address(token1)];
        uint256[2] memory minIncomingAssetAmounts = [uint256(0), uint256(0)];
        bytes memory actionArgs = abi.encode(_outgoingAssetAmount, incomingAssets, minIncomingAssetAmounts);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _actionArgs: actionArgs,
            _adapterAddress: address(uniswapV2LiquidityAdapter),
            _selector: IUniswapV2LiquidityAdapter.redeem.selector
        });
    }

    function test_lend_success() public {
        uint256 preLendToken0VaultBalance = token0.balanceOf(vaultProxyAddress);
        uint256 preLendToken1VaultBalance = token1.balanceOf(vaultProxyAddress);
        uint256 preLendPoolTokenVaultBalance = IERC20(address(uniswapV2Pool)).balanceOf(vaultProxyAddress);

        uint256[2] memory maxOutgoingAssetAmounts = [preLendToken0VaultBalance / 3, preLendToken1VaultBalance / 3];

        vm.recordLogs();

        __lend({_maxOutgoingAssetAmounts: maxOutgoingAssetAmounts});

        uint256 postLendToken0VaultBalance = token0.balanceOf(vaultProxyAddress);
        uint256 postLendToken1VaultBalance = token1.balanceOf(vaultProxyAddress);
        uint256 postLendPoolTokenVaultBalance = IERC20(address(uniswapV2Pool)).balanceOf(vaultProxyAddress);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(token0), address(token1)),
            _maxSpendAssetAmounts: toArray(maxOutgoingAssetAmounts[0], maxOutgoingAssetAmounts[1]),
            _incomingAssets: toArray(address(uniswapV2Pool)),
            _minIncomingAssetAmounts: toArray(uint256(0))
        });

        // Assert that the vault's token balances have decreased by at most the maxOutgoingAssetAmountand that the poolToken's balance has increased
        assertLe(
            preLendToken0VaultBalance - postLendToken0VaultBalance,
            maxOutgoingAssetAmounts[0],
            "Incorrect token0 balance after lend"
        );
        assertLe(
            preLendToken1VaultBalance - postLendToken1VaultBalance,
            maxOutgoingAssetAmounts[1],
            "Incorrect token1 balance after lend"
        );
        assertGt(postLendPoolTokenVaultBalance, preLendPoolTokenVaultBalance, "Incorrect poolToken balance after lend");
    }

    function test_redeem_success() public {
        // Lend some assets to the pool so that the vault holds poolTokens to redeem
        uint256[2] memory maxOutgoingAssetAmounts =
            [token0.balanceOf(vaultProxyAddress) / 3, token1.balanceOf(vaultProxyAddress) / 3];
        __lend({_maxOutgoingAssetAmounts: maxOutgoingAssetAmounts});

        uint256 preRedeemToken0VaultBalance = token0.balanceOf(vaultProxyAddress);
        uint256 preRedeemToken1VaultBalance = token1.balanceOf(vaultProxyAddress);
        uint256 preRedeemPoolTokenVaultBalance = IERC20(address(uniswapV2Pool)).balanceOf(vaultProxyAddress);

        uint256 outgoingAssetAmount = preRedeemPoolTokenVaultBalance / 3;

        (uint256 expectedToken0Amount, uint256 expectedToken1Amount) = getExpectedUnderlyingTokenAmounts({
            _poolTokenAddress: address(uniswapV2Pool),
            _redeemPoolTokenAmount: outgoingAssetAmount
        });

        vm.recordLogs();

        __redeem({_outgoingAssetAmount: outgoingAssetAmount});

        uint256 postRedeemToken0VaultBalance = token0.balanceOf(vaultProxyAddress);
        uint256 postRedeemToken1VaultBalance = token1.balanceOf(vaultProxyAddress);
        uint256 postRedeemPoolTokenVaultBalance = IERC20(address(uniswapV2Pool)).balanceOf(vaultProxyAddress);

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(uniswapV2Pool)),
            _maxSpendAssetAmounts: toArray(outgoingAssetAmount),
            _incomingAssets: toArray(address(token0), address(token1)),
            _minIncomingAssetAmounts: toArray(uint256(0), uint256(0))
        });

        // Assert that the vault's poolToken balance has decreased and that the tokens have increased
        assertEq(
            preRedeemPoolTokenVaultBalance - postRedeemPoolTokenVaultBalance,
            outgoingAssetAmount,
            "Incorrect poolToken balance after redeem"
        );
        assertEq(
            postRedeemToken0VaultBalance - preRedeemToken0VaultBalance,
            expectedToken0Amount,
            "Incorrect token0 balance after redeem"
        );
        assertEq(
            postRedeemToken1VaultBalance - preRedeemToken1VaultBalance,
            expectedToken1Amount,
            "Incorrect token1 balance after redeem"
        );
    }
}

contract EthereumWethUsdcTest is UniswapV2LiquidityAdapterTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: ETHEREUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ETHEREUM_UNISWAP_V2_FACTORY,
            _uniswapV2RouterAddress: ETHEREUM_UNISWAP_V2_ROUTER,
            _uniswapV2PoolAddress: ETHEREUM_UNISWAP_V2_POOL_WETH_USDC
        });
    }
}

contract EthereumWethUsdcTestV4 is UniswapV2LiquidityAdapterTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: ETHEREUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ETHEREUM_UNISWAP_V2_FACTORY,
            _uniswapV2RouterAddress: ETHEREUM_UNISWAP_V2_ROUTER,
            _uniswapV2PoolAddress: ETHEREUM_UNISWAP_V2_POOL_WETH_USDC
        });
    }
}

contract PolygonWmaticUsdcTest is UniswapV2LiquidityAdapterTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: POLYGON_CHAIN_ID,
            _uniswapV2FactoryAddress: POLYGON_UNISWAP_V2_FACTORY,
            _uniswapV2RouterAddress: POLYGON_UNISWAP_V2_ROUTER,
            _uniswapV2PoolAddress: POLYGON_UNISWAP_V2_POOL_WMATIC_USDT
        });
    }
}

contract PolygonWmaticUsdcTestV4 is UniswapV2LiquidityAdapterTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: POLYGON_CHAIN_ID,
            _uniswapV2FactoryAddress: POLYGON_UNISWAP_V2_FACTORY,
            _uniswapV2RouterAddress: POLYGON_UNISWAP_V2_ROUTER,
            _uniswapV2PoolAddress: POLYGON_UNISWAP_V2_POOL_WMATIC_USDT
        });
    }
}

contract ArbitrumWmaticUsdcTest is UniswapV2LiquidityAdapterTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: ARBITRUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ARBITRUM_UNISWAP_V2_FACTORY,
            _uniswapV2RouterAddress: ARBITRUM_UNISWAP_V2_ROUTER,
            _uniswapV2PoolAddress: ARBITRUM_UNISWAP_V2_POOL_WETH_USDC
        });
    }
}

contract ArbitrumWmaticUsdcTestV4 is UniswapV2LiquidityAdapterTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: ARBITRUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ARBITRUM_UNISWAP_V2_FACTORY,
            _uniswapV2RouterAddress: ARBITRUM_UNISWAP_V2_ROUTER,
            _uniswapV2PoolAddress: ARBITRUM_UNISWAP_V2_POOL_WETH_USDC
        });
    }
}

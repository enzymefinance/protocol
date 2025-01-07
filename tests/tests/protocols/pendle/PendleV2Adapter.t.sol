// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IPendleV2Market as IPendleV2MarketProd} from "contracts/external-interfaces/IPendleV2Market.sol";
import {IPendleV2Router as IPendleV2RouterProd} from "contracts/external-interfaces/IPendleV2Router.sol";
import {IPendleV2Adapter as IPendleV2AdapterProd} from
    "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IPendleV2Adapter.sol";
import {IPendleV2Adapter as IPendleV2AdapterProd} from
    "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IPendleV2Adapter.sol";
import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IPendleV2Market} from "tests/interfaces/external/IPendleV2Market.sol";
import {IPendleV2PrincipalToken} from "tests/interfaces/external/IPendleV2PrincipalToken.sol";
import {IPendleV2PyYtLpOracle} from "tests/interfaces/external/IPendleV2PyYtLpOracle.sol";
import {IPendleV2StandardizedYield} from "tests/interfaces/external/IPendleV2StandardizedYield.sol";
import {IPendleV2Router} from "tests/interfaces/external/IPendleV2Router.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IPendleV2Adapter} from "tests/interfaces/internal/IPendleV2Adapter.sol";

// TODO: why ETHEREUM_BLOCK_TIME_SENSITIVE_PENDLE but not for ARBITRUM?

// ETHEREUM MAINNET CONSTANTS
address constant ETHEREUM_PY_YT_LP_ORACLE = 0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2;
address constant ETHEREUM_ROUTER = 0x888888888889758F76e7103c6CbF23ABbF58F946;
address constant ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS = 0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2;
address constant ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS = 0xF32e58F92e60f4b0A37A69b95d642A471365EAe8;
address constant ETHEREUM_FUSDC_26DEC2024_MARKET_ADDRESS = 0xcB71c2A73fd7588E1599DF90b88de2316585A860;

// ARBITRUM CONSTANTS
address constant ARBITRUM_PY_YT_LP_ORACLE = 0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2;
address constant ARBITRUM_ROUTER = 0x888888888889758F76e7103c6CbF23ABbF58F946;
address constant ARBITRUM_EETH_25SEPT2024_MARKET_ADDRESS = 0xf9F9779d8fF604732EBA9AD345E6A27EF5c2a9d6;
address constant ARBITRUM_EZETH_25SEPT2024_MARKET_ADDRESS = 0x35f3dB08a6e9cB4391348b0B404F493E7ae264c0;

address constant PENDLE_NATIVE_ASSET_ADDRESS = address(0);
uint256 constant PENDLE_ORACLE_RATE_PRECISION = 1e18;

abstract contract TestBase is IntegrationTest {
    IPendleV2PyYtLpOracle pendleOracle;
    IPendleV2Router pendleRouter;
    IPendleV2RouterProd.ApproxParams guessPt;

    IPendleV2Market market;
    IPendleV2PrincipalToken principalToken;
    IPendleV2StandardizedYield syToken;
    IERC20 underlyingAsset;

    IPendleV2Adapter pendleV2Adapter;

    address comptrollerProxyAddress;
    address fundOwner;
    address vaultProxyAddress;
    IIntegrationManager integrationManager;

    EnzymeVersion version;

    function __initialize(
        EnzymeVersion _version,
        address _pendleOracleAddress,
        address _pendleRouterAddress,
        address _pendleMarketAddress
    ) internal {
        // Assign vars from inputs
        version = _version;
        pendleOracle = IPendleV2PyYtLpOracle(_pendleOracleAddress);
        pendleRouter = IPendleV2Router(_pendleRouterAddress);
        market = IPendleV2Market(_pendleMarketAddress);

        // Assign market-specific vars
        (syToken, principalToken,) = market.readTokens();
        address yieldTokenAddress = syToken.yieldToken();
        underlyingAsset =
            IERC20(yieldTokenAddress == PENDLE_NATIVE_ASSET_ADDRESS ? address(wrappedNativeToken) : yieldTokenAddress);

        // Assign other misc vars
        integrationManager = IIntegrationManager(getIntegrationManagerAddressForVersion(version));
        // Default generic IPendleV2Router.ApproxParams. In a production setting, these settings can be calculated offchain to reduce gas usage.
        // src: https://docs.pendle.finance/Developers/Contracts/PendleRouter#approxparams
        guessPt = IPendleV2RouterProd.ApproxParams({
            guessMin: 0,
            guessMax: type(uint256).max,
            guessOffchain: 0,
            maxIteration: 256,
            eps: 1e15
        });

        // If v4, register all incoming assets to pass the asset universe validation:
        // - underlyingAsset
        // - PT
        // - LP
        if (version == EnzymeVersion.V4) {
            v4AddPrimitivesWithTestAggregator({
                _tokenAddresses: toArray(address(underlyingAsset), address(principalToken), address(market)),
                _skipIfRegistered: true
            });
        }

        // Deploy adapter
        pendleV2Adapter = __deployAdapter({
            _integrationManagerAddress: address(integrationManager),
            _pendleRouterAddress: _pendleRouterAddress,
            _wrappedNativeAssetAddress: address(wrappedNativeToken)
        });

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Increase the vault's balances of tokens to use in Pendle actions
        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: 100 ether});
        increaseTokenBalance({
            _token: underlyingAsset,
            _to: vaultProxyAddress,
            _amount: 100 * assetUnit(underlyingAsset)
        });
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(
        address _integrationManagerAddress,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    ) internal returns (IPendleV2Adapter pendleV2Adapter_) {
        address addr = deployCode(
            "PendleV2Adapter.sol",
            abi.encode(_integrationManagerAddress, _pendleRouterAddress, _wrappedNativeAssetAddress)
        );
        return IPendleV2Adapter(payable(addr));
    }

    // ACTION HELPERS

    function __action(IPendleV2AdapterProd.Action _actionId, bytes memory _encodedActionArgs) internal {
        bytes memory actionArgs = abi.encode(_actionId, _encodedActionArgs);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(pendleV2Adapter),
            _selector: IPendleV2Adapter.action.selector,
            _actionArgs: actionArgs
        });
    }

    function __addLiquidityFromUnderlying(
        address _depositTokenAddressInput,
        uint256 _depositTokenAmount,
        uint256 _minLpAmount
    ) internal {
        __action({
            _actionId: IPendleV2AdapterProd.Action.AddLiquidityFromUnderlying,
            _encodedActionArgs: abi.encode(
                IPendleV2AdapterProd.AddLiquidityFromUnderlyingActionArgs({
                    market: IPendleV2MarketProd(address(market)),
                    depositTokenAddress: _depositTokenAddressInput,
                    depositTokenAmount: _depositTokenAmount,
                    guessPtReceived: guessPt,
                    minLpAmount: _minLpAmount
                })
            )
        });
    }

    function __buyPrincipalToken(address _depositTokenAddressInput, uint256 _depositTokenAmount, uint256 _minPtAmount)
        internal
    {
        __action({
            _actionId: IPendleV2AdapterProd.Action.BuyPrincipalToken,
            _encodedActionArgs: abi.encode(
                IPendleV2AdapterProd.BuyPrincipalTokenActionArgs({
                    market: IPendleV2MarketProd(address(market)),
                    depositTokenAddress: _depositTokenAddressInput,
                    depositTokenAmount: _depositTokenAmount,
                    guessPtOut: guessPt,
                    minPtAmount: _minPtAmount
                })
            )
        });
    }

    function __removeLiquidityToPtAndUnderlying(
        uint256 _lpAmount,
        address _withdrawalTokenAddressInput,
        uint256 _minWithdrawalTokenAmount,
        uint256 _minPtAmount
    ) internal {
        __action({
            _actionId: IPendleV2AdapterProd.Action.RemoveLiquidityToPtAndUnderlying,
            _encodedActionArgs: abi.encode(
                IPendleV2AdapterProd.RemoveLiquidityToPtAndUnderlyingActionArgs({
                    market: IPendleV2MarketProd(address(market)),
                    lpAmount: _lpAmount,
                    withdrawalTokenAddress: _withdrawalTokenAddressInput,
                    minWithdrawalTokenAmount: _minWithdrawalTokenAmount,
                    minPtAmount: _minPtAmount
                })
            )
        });
    }

    function __removeLiquidityToUnderlying(
        uint256 _lpAmount,
        address _withdrawalTokenAddressInput,
        uint256 _minWithdrawalTokenAmount
    ) internal {
        __action({
            _actionId: IPendleV2AdapterProd.Action.RemoveLiquidityToUnderlying,
            _encodedActionArgs: abi.encode(
                IPendleV2AdapterProd.RemoveLiquidityToUnderlyingActionArgs({
                    market: IPendleV2MarketProd(address(market)),
                    withdrawalTokenAddress: _withdrawalTokenAddressInput,
                    lpAmount: _lpAmount,
                    minSyOut: 1,
                    minWithdrawalTokenAmount: _minWithdrawalTokenAmount
                })
            )
        });
    }

    function __sellPrincipalToken(
        uint256 _ptAmount,
        address _withdrawalTokenAddressInput,
        uint256 _minWithdrawalTokenAmount
    ) internal {
        __action({
            _actionId: IPendleV2AdapterProd.Action.SellPrincipalToken,
            _encodedActionArgs: abi.encode(
                IPendleV2AdapterProd.SellPrincipalTokenActionArgs({
                    market: IPendleV2MarketProd(address(market)),
                    withdrawalTokenAddress: _withdrawalTokenAddressInput,
                    ptAmount: _ptAmount,
                    minWithdrawalTokenAmount: _minWithdrawalTokenAmount
                })
            )
        });
    }

    // MISC HELPERS

    function __parseAssetInputForEnzyme(address _assetAddress) private view returns (address parsedAssetAddress_) {
        return _assetAddress == NATIVE_ASSET_ADDRESS ? address(wrappedNativeToken) : _assetAddress;
    }

    function __parseAssetInputForPendle(address _assetAddress) private pure returns (address parsedAssetAddress_) {
        return _assetAddress == NATIVE_ASSET_ADDRESS ? PENDLE_NATIVE_ASSET_ADDRESS : _assetAddress;
    }

    // TESTS

    function __test_buyPrincipalToken_success(address _depositTokenAddressInput) private {
        IERC20 depositToken = IERC20(__parseAssetInputForEnzyme(_depositTokenAddressInput));
        address pendleDepositAssetAddress = __parseAssetInputForPendle(_depositTokenAddressInput);
        uint256 depositTokenAmount = underlyingAsset.balanceOf(vaultProxyAddress) / 7;
        uint256 minPtAmount = 123;

        // Pre-calc the expected PT to receive
        uint256 expectedSyTokenIntermediary =
            syToken.previewDeposit({_tokenIn: pendleDepositAssetAddress, _amountTokenToDeposit: depositTokenAmount});
        uint256 expectedPtReceived = expectedSyTokenIntermediary * PENDLE_ORACLE_RATE_PRECISION
            / pendleOracle.getPtToSyRate({_market: address(market), _duration: 1});

        uint256 preDepositTokenBalance = depositToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __buyPrincipalToken({
            _depositTokenAddressInput: _depositTokenAddressInput,
            _depositTokenAmount: depositTokenAmount,
            _minPtAmount: minPtAmount
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(depositToken)),
            _maxSpendAssetAmounts: toArray(depositTokenAmount),
            _incomingAssets: toArray(address(principalToken)),
            _minIncomingAssetAmounts: toArray(minPtAmount)
        });

        uint256 postDepositTokenBalance = depositToken.balanceOf(vaultProxyAddress);
        uint256 postPtBalance = IERC20(address(principalToken)).balanceOf(vaultProxyAddress);

        // Assert outflow and inflow
        assertEq(
            postDepositTokenBalance, preDepositTokenBalance - depositTokenAmount, "Incorrect deposit token balance"
        );
        // Tolerate 0.5% difference
        assertApproxEqRel(postPtBalance, expectedPtReceived, WEI_ONE_PERCENT / 2, "Incorrect PT balance");
    }

    function test_buyPrincipalToken_successUnderlyingAsset() public {
        __test_buyPrincipalToken_success({_depositTokenAddressInput: address(underlyingAsset)});
    }

    // Test that a principal token can be bought through the native asset
    function test_buyPrincipalToken_successNativeAsset() public {
        // Run the test conditionally if the token supports depositing in the the native asset
        if (syToken.isValidTokenIn(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_buyPrincipalToken_success({_depositTokenAddressInput: NATIVE_ASSET_ADDRESS});
        }
    }

    function __test_sellPrincipalToken_success(address _withdrawalTokenAddressInput, bool _expiredPrincipalToken)
        private
    {
        IERC20 withdrawalToken = IERC20(__parseAssetInputForEnzyme(_withdrawalTokenAddressInput));
        address pendleWithdrawalAssetAddress = __parseAssetInputForPendle(_withdrawalTokenAddressInput);

        // Give the vault a balance of the principal token
        uint256 preWithdrawalPtBalance = assetUnit(IERC20(address(principalToken))) * 7;
        increaseTokenBalance({
            _token: IERC20(address(principalToken)),
            _to: vaultProxyAddress,
            _amount: preWithdrawalPtBalance
        });

        uint256 ptAmountToSell = preWithdrawalPtBalance / 3;
        uint256 minWithdrawalTokenAmount = 123;

        // Handle PT expiry condition
        uint256 expiry = principalToken.expiry();
        if (_expiredPrincipalToken) {
            vm.warp(expiry + 1);
        } else {
            assertLt(block.timestamp, expiry, "Principal token is expired");
        }

        // Pre-calc the expected withdrawal asset to receive
        uint256 expectedWithdrawalTokenDelta = syToken.previewRedeem({
            _tokenOut: pendleWithdrawalAssetAddress,
            _amountSharesToRedeem: ptAmountToSell * pendleOracle.getPtToSyRate({_market: address(market), _duration: 1})
                / PENDLE_ORACLE_RATE_PRECISION
        });

        uint256 preWithdrawalTokenBalance = withdrawalToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __sellPrincipalToken({
            _ptAmount: ptAmountToSell,
            _withdrawalTokenAddressInput: _withdrawalTokenAddressInput,
            _minWithdrawalTokenAmount: minWithdrawalTokenAmount
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(principalToken)),
            _maxSpendAssetAmounts: toArray(ptAmountToSell),
            _incomingAssets: toArray(address(withdrawalToken)),
            _minIncomingAssetAmounts: toArray(minWithdrawalTokenAmount)
        });

        uint256 postWithdrawalPtBalance = IERC20(address(principalToken)).balanceOf(vaultProxyAddress);
        uint256 postWithdrawalTokenBalance = withdrawalToken.balanceOf(vaultProxyAddress);

        // Assert outflow and inflow
        assertEq(postWithdrawalPtBalance, preWithdrawalPtBalance - ptAmountToSell, "Incorrect PT balance");
        // Tolerate 0.5% difference
        assertApproxEqRel(
            postWithdrawalTokenBalance,
            preWithdrawalTokenBalance + expectedWithdrawalTokenDelta,
            WEI_ONE_PERCENT / 2,
            "Incorrect withdrawal token balance"
        );
    }

    function test_sellPrincipalToken_successExpiredPrincipalToken() public {
        __test_sellPrincipalToken_success({
            _withdrawalTokenAddressInput: address(underlyingAsset),
            _expiredPrincipalToken: true
        });
    }

    function test_sellPrincipalToken_successNonExpiredPrincipalToken() public {
        __test_sellPrincipalToken_success({
            _withdrawalTokenAddressInput: address(underlyingAsset),
            _expiredPrincipalToken: false
        });
    }

    function test_sellPrincipalToken_successNativeAsset() public {
        // If the native asset is a valid withdrawal token, run the test
        if (syToken.isValidTokenOut(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_sellPrincipalToken_success({
                _withdrawalTokenAddressInput: NATIVE_ASSET_ADDRESS,
                _expiredPrincipalToken: false
            });
        }
    }

    function __test_addLiquidityFromUnderlying_success(address _depositTokenAddressInput) public {
        IERC20 depositToken = IERC20(__parseAssetInputForEnzyme(_depositTokenAddressInput));
        address pendleDepositAssetAddress = __parseAssetInputForPendle(_depositTokenAddressInput);
        uint256 depositTokenAmount = underlyingAsset.balanceOf(vaultProxyAddress) / 7;
        uint256 minLpAmount = 123;

        // Pre-calc the expected PT to receive
        uint256 expectedSyTokenIntermediary =
            syToken.previewDeposit({_tokenIn: pendleDepositAssetAddress, _amountTokenToDeposit: depositTokenAmount});
        uint256 expectedLpReceived = expectedSyTokenIntermediary * PENDLE_ORACLE_RATE_PRECISION
            / pendleOracle.getLpToSyRate({_market: address(market), _duration: 1});

        uint256 preDepositTokenBalance = depositToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __addLiquidityFromUnderlying({
            _depositTokenAddressInput: _depositTokenAddressInput,
            _depositTokenAmount: depositTokenAmount,
            _minLpAmount: minLpAmount
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(depositToken)),
            _maxSpendAssetAmounts: toArray(depositTokenAmount),
            _incomingAssets: toArray(address(market)),
            _minIncomingAssetAmounts: toArray(minLpAmount)
        });

        uint256 postDepositTokenBalance = depositToken.balanceOf(vaultProxyAddress);
        uint256 postLpTokenBalance = IERC20(address(market)).balanceOf(vaultProxyAddress);

        // Assert outflow and inflow
        assertEq(
            postDepositTokenBalance, preDepositTokenBalance - depositTokenAmount, "Incorrect deposit token balance"
        );
        // Tolerate 0.5% difference
        assertApproxEqRel(postLpTokenBalance, expectedLpReceived, WEI_ONE_PERCENT / 2, "Incorrect LP token balance");
    }

    function test_addLiquidityFromUnderlying_successUnderlyingAsset() public {
        __test_addLiquidityFromUnderlying_success({_depositTokenAddressInput: address(underlyingAsset)});
    }

    function test_addLiquidityFromUnderlying_successNativeAsset() public {
        // Run the test conditionally if the token supports depositing in the the native asset
        if (syToken.isValidTokenIn(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_addLiquidityFromUnderlying_success({_depositTokenAddressInput: NATIVE_ASSET_ADDRESS});
        }
    }

    function __test_removeLiquidityToUnderlying_success(address _withdrawalTokenAddressInput) private {
        IERC20 withdrawalToken = IERC20(__parseAssetInputForEnzyme(_withdrawalTokenAddressInput));
        address pendleWithdrawalAssetAddress = __parseAssetInputForPendle(_withdrawalTokenAddressInput);

        // Acquire a balance of the LP token
        __addLiquidityFromUnderlying({
            _depositTokenAddressInput: address(underlyingAsset),
            _depositTokenAmount: underlyingAsset.balanceOf(vaultProxyAddress) / 7,
            _minLpAmount: 1
        });
        uint256 preLpBalance = IERC20(address(market)).balanceOf(vaultProxyAddress);

        uint256 lpAmountToRedeem = preLpBalance / 3;
        uint256 minWithdrawalTokenAmount = 123;

        uint256 expectedWithdrawalTokenDelta = syToken.previewRedeem({
            _tokenOut: pendleWithdrawalAssetAddress,
            _amountSharesToRedeem: lpAmountToRedeem * pendleOracle.getLpToSyRate({_market: address(market), _duration: 1})
                / PENDLE_ORACLE_RATE_PRECISION
        });

        uint256 preWithdrawalTokenBalance = withdrawalToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __removeLiquidityToUnderlying({
            _lpAmount: lpAmountToRedeem,
            _withdrawalTokenAddressInput: _withdrawalTokenAddressInput,
            _minWithdrawalTokenAmount: minWithdrawalTokenAmount
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(market)),
            _maxSpendAssetAmounts: toArray(lpAmountToRedeem),
            _incomingAssets: toArray(address(withdrawalToken)),
            _minIncomingAssetAmounts: toArray(minWithdrawalTokenAmount)
        });

        uint256 postLpBalance = IERC20(address(market)).balanceOf(vaultProxyAddress);
        uint256 postWithdrawalTokenBalance = withdrawalToken.balanceOf(vaultProxyAddress);

        // Assert outflow and inflow
        assertEq(postLpBalance, preLpBalance - lpAmountToRedeem, "Incorrect LP balance");
        // Tolerate 0.5% difference
        assertApproxEqRel(
            postWithdrawalTokenBalance,
            preWithdrawalTokenBalance + expectedWithdrawalTokenDelta,
            WEI_ONE_PERCENT / 2,
            "Incorrect withdrawal token balance"
        );
    }

    function test_removeLiquidityToUnderlying_successNonExpiredPrincipalToken() public {
        __test_removeLiquidityToUnderlying_success({_withdrawalTokenAddressInput: address(underlyingAsset)});
    }

    function test_removeLiquidityToUnderlying_successNativeAsset() public {
        // If the native asset is a valid withdrawal token, run the test
        if (syToken.isValidTokenOut(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_removeLiquidityToUnderlying_success({_withdrawalTokenAddressInput: NATIVE_ASSET_ADDRESS});
        }
    }

    function __test_removeLiquidityToPtAndUnderlying_success(address _withdrawalTokenAddressInput) private {
        IERC20 withdrawalToken = IERC20(__parseAssetInputForEnzyme(_withdrawalTokenAddressInput));

        // Acquire a balance of the LP token
        __addLiquidityFromUnderlying({
            _depositTokenAddressInput: address(underlyingAsset),
            _depositTokenAmount: underlyingAsset.balanceOf(vaultProxyAddress) / 7,
            _minLpAmount: 1
        });
        uint256 preLpBalance = IERC20(address(market)).balanceOf(vaultProxyAddress);

        uint256 lpAmountToRedeem = preLpBalance / 3;
        uint256 minWithdrawalTokenAmount = 123;
        uint256 minPtAmount = 456;

        uint256 prePtBalance = IERC20(address(principalToken)).balanceOf(vaultProxyAddress);
        uint256 preWithdrawalTokenBalance = withdrawalToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __removeLiquidityToPtAndUnderlying({
            _lpAmount: lpAmountToRedeem,
            _withdrawalTokenAddressInput: _withdrawalTokenAddressInput,
            _minWithdrawalTokenAmount: minWithdrawalTokenAmount,
            _minPtAmount: minPtAmount
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(market)),
            _maxSpendAssetAmounts: toArray(lpAmountToRedeem),
            _incomingAssets: toArray(address(withdrawalToken), address(principalToken)),
            _minIncomingAssetAmounts: toArray(minWithdrawalTokenAmount, minPtAmount)
        });

        uint256 postLpBalance = IERC20(address(market)).balanceOf(vaultProxyAddress);
        uint256 postPtBalance = IERC20(address(principalToken)).balanceOf(vaultProxyAddress);
        uint256 postWithdrawalTokenBalance = withdrawalToken.balanceOf(vaultProxyAddress);

        // Assert outflow and inflow
        assertEq(postLpBalance, preLpBalance - lpAmountToRedeem, "Incorrect LP balance");
        // TODO: could estimate actual inflow value or amounts
        assertGt(postWithdrawalTokenBalance, preWithdrawalTokenBalance, "Withdrawal token balance did not increase");
        assertGt(postPtBalance, prePtBalance, "Pt balance did not increase");
    }

    function test_removeLiquidityToPtAndUnderlying_success() public {
        __test_removeLiquidityToPtAndUnderlying_success({_withdrawalTokenAddressInput: address(underlyingAsset)});
    }

    function test_removeLiquidityToPtAndUnderlying_successNativeAsset() public {
        // If the native asset is a valid withdrawal token, run the test
        if (syToken.isValidTokenOut(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_removeLiquidityToPtAndUnderlying_success({_withdrawalTokenAddressInput: NATIVE_ASSET_ADDRESS});
        }
    }
}

abstract contract TestEthereumBase is TestBase {
    function __initializeEthereum(EnzymeVersion _version, address _pendleMarketAddress) internal {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TIME_SENSITIVE_PENDLE);

        __initialize({
            _version: _version,
            _pendleOracleAddress: ETHEREUM_PY_YT_LP_ORACLE,
            _pendleRouterAddress: ETHEREUM_ROUTER,
            _pendleMarketAddress: _pendleMarketAddress
        });
    }
}

abstract contract TestArbitrumBase is TestBase {
    function __initializeArbitrum(EnzymeVersion _version, address _pendleMarketAddress) internal {
        setUpArbitrumEnvironment(ARBITRUM_BLOCK_TIME_SENSITIVE);

        __initialize({
            _version: _version,
            _pendleOracleAddress: ARBITRUM_PY_YT_LP_ORACLE,
            _pendleRouterAddress: ARBITRUM_ROUTER,
            _pendleMarketAddress: _pendleMarketAddress
        });
    }
}

// Pendle weETH is a v3 market
contract WeEthTestEthereum is TestEthereumBase {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS
        });
    }
}

// Pendle weETH is a v3 market
contract WeEthTestEthereumV4 is TestEthereumBase {
    function setUp() public override {
        __initializeEthereum({_version: EnzymeVersion.V4, _pendleMarketAddress: ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS});
    }
}

// Pendle steth is a v1 market
contract StethTestEthereum is TestEthereumBase {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS
        });
    }
}

// Pendle steth is a v1 market
contract StethTestEthereumV4 is TestEthereumBase {
    function setUp() public override {
        __initializeEthereum({_version: EnzymeVersion.V4, _pendleMarketAddress: ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS});
    }
}

// Pendle FUSDc is a market where the decimals of the yieldToken aren't equal to the decimals of the asset returned by assetInfo
contract FUsdcTestEthereum is TestEthereumBase {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ETHEREUM_FUSDC_26DEC2024_MARKET_ADDRESS
        });
    }
}

// Pendle FUSDc is a market where the decimals of the yieldToken aren't equal to the decimals of the asset returned by assetInfo
contract FUsdcTestEthereumV4 is TestEthereumBase {
    function setUp() public override {
        __initializeEthereum({_version: EnzymeVersion.V4, _pendleMarketAddress: ETHEREUM_FUSDC_26DEC2024_MARKET_ADDRESS});
    }
}

contract EzethTestArbitrum is TestArbitrumBase {
    function setUp() public override {
        __initializeArbitrum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ARBITRUM_EZETH_25SEPT2024_MARKET_ADDRESS
        });
    }
}

contract EEthTestArbitrumV4 is TestArbitrumBase {
    function setUp() public override {
        __initializeArbitrum({
            _version: EnzymeVersion.V4,
            _pendleMarketAddress: ARBITRUM_EZETH_25SEPT2024_MARKET_ADDRESS
        });
    }
}

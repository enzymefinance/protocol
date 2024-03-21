// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IPendleV2Position as IPendleV2PositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/pendle-v2/IPendleV2Position.sol";
import {IPendleV2Market as IPendleV2MarketProd} from "contracts/external-interfaces/IPendleV2Market.sol";
import {PendleLpOracleLib} from "contracts/utils/0.8.19/pendle/adapted-libs/PendleLpOracleLib.sol";
import {IPendleV2Market as IOracleLibPendleMarket} from
    "contracts/utils/0.8.19/pendle/adapted-libs/interfaces/IPendleV2Market.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IPendleV2Market} from "tests/interfaces/external/IPendleV2Market.sol";
import {IPendleV2PrincipalToken} from "tests/interfaces/external/IPendleV2PrincipalToken.sol";
import {IPendleV2PtOracle} from "tests/interfaces/external/IPendleV2PtOracle.sol";
import {IPendleV2StandardizedYield} from "tests/interfaces/external/IPendleV2StandardizedYield.sol";
import {IPendleV2Router} from "tests/interfaces/external/IPendleV2Router.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IPendleV2PositionLib} from "tests/interfaces/internal/IPendleV2PositionLib.sol";
import {IPendleV2PositionParser} from "tests/interfaces/internal/IPendleV2PositionParser.sol";

// ETHEREUM MAINNET CONSTANTS
address constant ETHEREUM_MARKET_FACTORY_V1 = 0x27b1dAcd74688aF24a64BD3C9C1B143118740784;
address constant ETHEREUM_MARKET_FACTORY_V3 = 0x1A6fCc85557BC4fB7B534ed835a03EF056552D52;
address constant ETHEREUM_PT_ORACLE = 0xbbd487268A295531d299c125F3e5f749884A3e30;
address constant ETHEREUM_ROUTER = 0x00000000005BBB0EF59571E58418F9a4357b68A0;
address constant ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS = 0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2;
address constant ETHEREUM_EZETH_25APR2024_MARKET_ADDRESS = 0xDe715330043799D7a80249660d1e6b61eB3713B3;
address constant ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS = 0xF32e58F92e60f4b0A37A69b95d642A471365EAe8;

uint32 constant MINIMUM_PRICING_DURATION = uint32(60 * 15); // 15 minutes
uint32 constant MAXIMUM_PRICING_DURATION = uint32(60 * 30); // 30 minutes
uint256 constant ORACLE_RATE_PRECISION = 1e18;
address constant PENDLE_NATIVE_ASSET_ADDRESS = address(0);

abstract contract PendleTestBase is IntegrationTest {
    event PrincipalTokenAdded(address indexed principalToken, address indexed market);

    event PrincipalTokenRemoved(address indexed principalToken);

    event LpTokenAdded(address indexed lpToken);

    event LpTokenRemoved(address indexed lpToken);

    event OracleDurationForMarketAdded(address indexed market, uint32 indexed pricingDuration);

    uint256 internal pendleV2TypeId;
    uint256 internal pendleMarketFactoriesListId;
    IPendleV2PositionLib internal pendleV2PositionLib;
    IPendleV2PositionParser internal pendleV2PositionParser;
    IPendleV2PositionLib internal pendleV2ExternalPosition;

    IERC20 internal underlyingAsset;
    IPendleV2Market internal market;
    IPendleV2PrincipalToken internal principalToken;
    IPendleV2PtOracle internal pendlePtOracle;
    IPendleV2Router internal pendleRouter;
    IPendleV2Router.ApproxParams internal guessPtOut;
    IPendleV2StandardizedYield internal syToken;
    uint256 internal depositAmount;
    uint32 internal pricingDuration;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal vaultProxyAddress;
    IExternalPositionManager internal externalPositionManager;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        address[] memory _pendleMarketFactoryAddresses,
        address _pendlePtOracleAddress,
        address _pendleRouterAddress,
        address _pendleMarketAddress,
        uint32 _pricingDuration
    ) internal {
        version = _version;

        setUpMainnetEnvironment(ETHEREUM_BLOCK_PENDLE_TIME_SENSITIVE);

        pendlePtOracle = IPendleV2PtOracle(_pendlePtOracleAddress);
        pendleRouter = IPendleV2Router(_pendleRouterAddress);

        // Create a new AddressListRegistry list for Pendle Market factories
        pendleMarketFactoriesListId = core.persistent.addressListRegistry.createList({
            _owner: makeAddr("PendleMarketFactoriesListOwner"),
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
            _initialItems: _pendleMarketFactoryAddresses
        });

        externalPositionManager = IExternalPositionManager(getExternalPositionManagerAddressForVersion(version));
        (pendleV2PositionLib, pendleV2PositionParser, pendleV2TypeId) = deployPendleV2({
            _addressListRegistry: address(core.persistent.addressListRegistry),
            _minimumPricingDuration: MINIMUM_PRICING_DURATION,
            _maximumPricingDuration: MAXIMUM_PRICING_DURATION,
            _pendleMarketFactoriesListId: pendleMarketFactoriesListId,
            _pendlePtOracleAddress: _pendlePtOracleAddress,
            _pendleRouterAddress: _pendleRouterAddress,
            _wrappedNativeAssetAddress: address(wrappedNativeToken)
        });

        market = IPendleV2Market(_pendleMarketAddress);
        pricingDuration = _pricingDuration;
        (syToken, principalToken,) = market.readTokens();

        // Default generic guessPtOut. In a production setting, these settings can be calculated offchain to reduce gas usage.
        // src: https://docs.pendle.finance/Developers/Contracts/PendleRouter#approxparams
        guessPtOut = IPendleV2Router.ApproxParams({
            guessMin: 0,
            guessMax: type(uint256).max,
            guessOffchain: 0,
            maxIteration: 256,
            eps: 1e15
        });

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        vm.prank(fundOwner);
        pendleV2ExternalPosition = IPendleV2PositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: pendleV2TypeId,
                _initializationData: ""
            })
        );

        // Increase the wrapped native token balance to allow testing native token deposits
        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: 100 ether});

        // Seed the vault with the pendle syToken underlying
        (, address underlyingAssetAddress,) = syToken.assetInfo();

        // If underlyingAssetAddress is the 0 address, this indicates that the NATIVE_ASSET is the reference asset
        if (underlyingAssetAddress == PENDLE_NATIVE_ASSET_ADDRESS) {
            underlyingAssetAddress = address(wrappedNativeToken);
        }

        underlyingAsset = IERC20(underlyingAssetAddress);

        // Add the underlyingAsset to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: underlyingAssetAddress,
            _skipIfRegistered: true
        });

        increaseTokenBalance({
            _token: underlyingAsset,
            _to: vaultProxyAddress,
            _amount: 100 * assetUnit(underlyingAsset)
        });

        depositAmount = underlyingAsset.balanceOf(vaultProxyAddress) / 7;
    }

    // DEPLOYMENT HELPERS

    function deployPendleV2(
        address _addressListRegistry,
        uint32 _minimumPricingDuration,
        uint32 _maximumPricingDuration,
        uint256 _pendleMarketFactoriesListId,
        address _pendlePtOracleAddress,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    )
        public
        returns (
            IPendleV2PositionLib pendleV2PositionLib_,
            IPendleV2PositionParser pendleV2PositionParser_,
            uint256 typeId_
        )
    {
        pendleV2PositionLib_ = deployPendleV2PositionLib({
            _addressListRegistry: _addressListRegistry,
            _minimumPricingDuration: _minimumPricingDuration,
            _maximumPricingDuration: _maximumPricingDuration,
            _pendleMarketFactoriesListId: _pendleMarketFactoriesListId,
            _pendlePtOracleAddress: _pendlePtOracleAddress,
            _pendleRouterAddress: _pendleRouterAddress,
            _wrappedNativeAssetAddress: _wrappedNativeAssetAddress
        });

        pendleV2PositionParser_ = deployPendleV2PositionParser({_wrappedNativeAssetAddress: _wrappedNativeAssetAddress});

        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "PENDLE_V2",
            _lib: address(pendleV2PositionLib_),
            _parser: address(pendleV2PositionParser_)
        });

        return (pendleV2PositionLib_, pendleV2PositionParser_, typeId_);
    }

    function deployPendleV2PositionLib(
        address _addressListRegistry,
        uint32 _minimumPricingDuration,
        uint32 _maximumPricingDuration,
        uint256 _pendleMarketFactoriesListId,
        address _pendlePtOracleAddress,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    ) public returns (IPendleV2PositionLib) {
        bytes memory args = abi.encode(
            _addressListRegistry,
            _minimumPricingDuration,
            _maximumPricingDuration,
            _pendleMarketFactoriesListId,
            _pendlePtOracleAddress,
            _pendleRouterAddress,
            _wrappedNativeAssetAddress
        );
        address addr = deployCode("PendleV2PositionLib.sol", args);
        return IPendleV2PositionLib(addr);
    }

    function deployPendleV2PositionParser(address _wrappedNativeAssetAddress)
        public
        returns (IPendleV2PositionParser)
    {
        bytes memory args = abi.encode(_wrappedNativeAssetAddress);
        address addr = deployCode("PendleV2PositionParser.sol", args);
        return IPendleV2PositionParser(addr);
    }

    // ACTION HELPERS

    function __buyPrincipalTokenVerbose(
        IPendleV2PrincipalToken _principalToken,
        IPendleV2Market _market,
        uint32 _pricingDuration,
        address _depositTokenAddress,
        uint256 _depositAmount,
        IPendleV2Router.ApproxParams memory _guessPtOut,
        uint256 _minPtOut
    ) private {
        bytes memory actionArgs = abi.encode(
            _principalToken, _market, _pricingDuration, _depositTokenAddress, _depositAmount, _guessPtOut, _minPtOut
        );

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.BuyPrincipalToken),
            _actionArgs: actionArgs
        });
    }

    function __buyPrincipalToken(address _depositTokenAddress) private {
        __buyPrincipalTokenVerbose({
            _principalToken: principalToken,
            _market: market,
            _pricingDuration: pricingDuration,
            _depositTokenAddress: _depositTokenAddress,
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minPtOut: 0
        });
    }

    function __sellPrincipalTokenVerbose(
        IPendleV2PrincipalToken _principalToken,
        IPendleV2Market _market,
        address _underlyingAsset,
        uint256 _withdrawalAmount,
        uint256 _minIncomingAmount
    ) private {
        bytes memory actionArgs =
            abi.encode(_principalToken, _market, _underlyingAsset, _withdrawalAmount, _minIncomingAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.SellPrincipalToken),
            _actionArgs: actionArgs
        });
    }

    function __sellPrincipalToken(address _withdrawalTokenAddress, uint256 _withdrawalAmount) private {
        __sellPrincipalTokenVerbose({
            _principalToken: principalToken,
            _market: market,
            _underlyingAsset: _withdrawalTokenAddress,
            _withdrawalAmount: _withdrawalAmount,
            _minIncomingAmount: 0
        });
    }

    function __addLiquidityVerbose(
        IPendleV2Market _market,
        uint32 _pricingDuration,
        IERC20 _underlyingAsset,
        uint256 _depositAmount,
        IPendleV2Router.ApproxParams memory _guessPtOut,
        uint256 _minLpOut
    ) private {
        bytes memory actionArgs =
            abi.encode(_market, _pricingDuration, _underlyingAsset, _depositAmount, _guessPtOut, _minLpOut);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.AddLiquidity),
            _actionArgs: actionArgs
        });
    }

    function __addLiquidity() private {
        __addLiquidityVerbose({
            _market: market,
            _pricingDuration: pricingDuration,
            _underlyingAsset: underlyingAsset,
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minLpOut: 0
        });
    }

    function __removeLiquidityVerbose(
        IPendleV2Market _market,
        IERC20 _withdrawalToken,
        uint256 _withdrawalAmount,
        uint256 _minSyOut,
        uint256 _minIncomingAmount
    ) private {
        bytes memory actionArgs =
            abi.encode(_market, _withdrawalToken, _withdrawalAmount, _minSyOut, _minIncomingAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.RemoveLiquidity),
            _actionArgs: actionArgs
        });
    }

    function __removeLiquidity(uint256 _withdrawalAmount) private {
        __removeLiquidityVerbose({
            _market: market,
            _withdrawalToken: underlyingAsset,
            _withdrawalAmount: _withdrawalAmount,
            _minSyOut: 0,
            _minIncomingAmount: 0
        });
    }

    function __claimRewards(address[] memory marketAddresses) private {
        bytes memory actionArgs = abi.encode(marketAddresses);
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.ClaimRewards),
            _actionArgs: actionArgs
        });
    }

    // TESTS

    function __test_buyPrincipalToken_success(address _depositTokenAddress) private {
        vm.recordLogs();

        // Assert that the AddPrincipalToken event has been emitted
        expectEmit(address(pendleV2ExternalPosition));
        emit PrincipalTokenAdded(address(principalToken), address(market));

        // Assert that the AddMarket event has been emitted
        expectEmit(address(pendleV2ExternalPosition));
        emit OracleDurationForMarketAdded(address(market), pricingDuration);

        __buyPrincipalToken({_depositTokenAddress: _depositTokenAddress});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        // Assert that the principalToken has been added to the external position
        assertEq(toArray(address(principalToken)), pendleV2ExternalPosition.getPrincipalTokens());

        // Assert that the market has been added to the external position with the proper duration
        assertEq(pricingDuration, pendleV2ExternalPosition.getOraclePricingDurationForMarket(address(market)));

        // Assert that the PrincipalToken value is accounted for in the EP
        (, address expectedAsset,) = syToken.assetInfo();
        uint256 principalTokenBalance = IERC20(address(principalToken)).balanceOf(address(pendleV2ExternalPosition));

        // Assert that there is some PT balance in the EP
        assertGt(principalTokenBalance, 0, "Incorrect principalToken balance");

        uint256 expectedAssetAmount = principalTokenBalance
            * pendlePtOracle.getPtToAssetRate({_market: address(market), _duration: pricingDuration})
            / ORACLE_RATE_PRECISION;

        // Assert that the EP holds the principalToken
        (address[] memory assets, uint256[] memory amounts) = pendleV2ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(expectedAsset), "Incorrect managed assets");
        assertEq(amounts, toArray(expectedAssetAmount), "Incorrect managed asset amounts");

        // Assert that the principalToken value is close to what has been deposited
        // Only run this if the depositTokenAddress is the same as the expected asset (the asset the rate is returned in)
        if (_depositTokenAddress == expectedAsset) {
            assertApproxEqRel(depositAmount, amounts[0], WEI_ONE_PERCENT / 2);
        }

        // Assert that there is no residual _depositTokenAddress balance stuck in the EP
        assertEq(0, IERC20(expectedAsset).balanceOf(address(pendleV2ExternalPosition)));
        // Assert that there is no residual SYToken balance stuck in the EP
        assertEq(0, IERC20(address(syToken)).balanceOf(address(pendleV2ExternalPosition)));
    }

    function test_buyPrincipalToken_underlyingAsset_success() public {
        __test_buyPrincipalToken_success({_depositTokenAddress: address(underlyingAsset)});
    }

    // Test that a principal token can be bought through the native asset.
    function test_buyPrincipalToken_nativeAsset_success() public {
        // Run the test conditionally if the token supports depositing in the the native asset.
        if (syToken.isValidTokenIn(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_buyPrincipalToken_success({_depositTokenAddress: NATIVE_ASSET_ADDRESS});
        }
    }

    // Test buying a principalToken for which the rate asset is the native asset
    // TODO: Uncomment this when the oracle is ready for usage, or when we find a way to mock its validity
    // function test_buyPrincipalToken_nativeRateAsset_success() public {
    //     IPendleV2Market marketNativeRateAsset = IPendleV2Market(ETHEREUM_EZETH_25APR2024_MARKET_ADDRESS);
    //     (, IPendleV2PrincipalToken principalTokenNativeRateAsset,) = marketNativeRateAsset.readTokens();
    //     __buyPrincipalTokenVerbose({
    //         _principalToken: principalTokenNativeRateAsset,
    //         _market: marketNativeRateAsset,
    //         _pricingDuration: 900,
    //         _depositTokenAddress: NATIVE_ASSET_ADDRESS,
    //         _depositAmount: depositAmount,
    //         _guessPtOut: guessPtOut,
    //         _minPtOut: 0
    //     });
    // }

    // Test that the function reverts if the market mismatches the previously set market for the principal token
    function test_buyPrincipalToken_inconsistentMarket_failure() public {
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});

        vm.expectRevert(formatError("__handlePrincipalTokenInput: stored market address mismatch"));

        // Attempt to buy the same principalToken with a different market
        __buyPrincipalTokenVerbose({
            _principalToken: principalToken,
            _market: IPendleV2Market(makeAddr("Invalid market")),
            _pricingDuration: pricingDuration,
            _depositTokenAddress: address(underlyingAsset),
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minPtOut: 0
        });

        vm.expectRevert(formatError("__handleMarketAndDurationInput: stored duration mismatch"));

        // Attempt to buy the same principalToken with the same market but a different duration
        __buyPrincipalTokenVerbose({
            _principalToken: principalToken,
            _market: market,
            _pricingDuration: pricingDuration + 1,
            _depositTokenAddress: address(underlyingAsset),
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minPtOut: 0
        });
    }

    // Test that the function reverts if the pricing duration is not supported by the market
    function test_buyPrincipalToken_badMarketPricingDuration_failure() public {
        IPendleV2Market marketBadMarketPricingDuration = IPendleV2Market(ETHEREUM_EZETH_25APR2024_MARKET_ADDRESS);
        (IPendleV2StandardizedYield sy, IPendleV2PrincipalToken pt,) = marketBadMarketPricingDuration.readTokens();

        // Use the first available deposit token as the deposit token
        address depositTokenAddress = sy.getTokensIn()[0];

        // Seed the deposit token
        increaseTokenBalance({_token: IERC20(depositTokenAddress), _to: vaultProxyAddress, _amount: depositAmount});

        vm.expectRevert(formatError("__validateMarketAndDuration: invalid pricing duration"));

        __buyPrincipalTokenVerbose({
            _principalToken: pt,
            _market: marketBadMarketPricingDuration,
            _pricingDuration: 900,
            _depositTokenAddress: depositTokenAddress,
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minPtOut: 0
        });
    }

    // Test that the function reverts if the pricing duration falls outside of the EP's supported range
    function test_buyPrincipalToken_badPricingDuration_failure() public {
        uint32 tooSmallDuration = MINIMUM_PRICING_DURATION - 1;
        uint32 tooBigDuration = MAXIMUM_PRICING_DURATION + 1;

        vm.expectRevert(formatError("__validateMarketAndDuration: out-of-bounds duration"));

        __buyPrincipalTokenVerbose({
            _principalToken: principalToken,
            _market: market,
            _pricingDuration: tooSmallDuration,
            _depositTokenAddress: address(underlyingAsset),
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minPtOut: 0
        });

        vm.expectRevert(formatError("__validateMarketAndDuration: out-of-bounds duration"));

        __buyPrincipalTokenVerbose({
            _principalToken: principalToken,
            _market: market,
            _pricingDuration: tooBigDuration,
            _depositTokenAddress: address(underlyingAsset),
            _depositAmount: depositAmount,
            _guessPtOut: guessPtOut,
            _minPtOut: 0
        });
    }

    function __test_sellPrincipalToken(bool _sellAll, bool _expiredPrincipalToken) private {
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});

        uint256 preUnderlyingAssetBalance = underlyingAsset.balanceOf(vaultProxyAddress);
        uint256 principalTokenBalance = IERC20(address(principalToken)).balanceOf(address(pendleV2ExternalPosition));
        uint256 withdrawalAmount = _sellAll ? principalTokenBalance : principalTokenBalance / 3;

        if (_expiredPrincipalToken) {
            uint256 expiry = principalToken.expiry();
            vm.warp(expiry + 1);
        }

        uint256 expectedUnderlyingDelta = withdrawalAmount
            * pendlePtOracle.getPtToAssetRate({_market: address(market), _duration: pricingDuration})
            / ORACLE_RATE_PRECISION;

        if (_sellAll) {
            // Expect the principalToken to be removed from the EP
            vm.expectEmit();
            emit PrincipalTokenRemoved(address(principalToken));
        }

        __sellPrincipalToken({_withdrawalTokenAddress: address(underlyingAsset), _withdrawalAmount: withdrawalAmount});

        if (_sellAll) {
            // Assert that the principalToken has been removed from the external position
            assertEq(0, pendleV2ExternalPosition.getPrincipalTokens().length);
        } else {
            assertEq(1, pendleV2ExternalPosition.getPrincipalTokens().length);
        }

        uint256 postUnderlyingAssetBalance = underlyingAsset.balanceOf(vaultProxyAddress);

        // Assert that the underlying balance has increased by the amount expected from the withdrawal
        assertApproxEqRel(
            postUnderlyingAssetBalance, preUnderlyingAssetBalance + expectedUnderlyingDelta, WEI_ONE_PERCENT / 10
        );
    }

    function test_sellPrincipalToken_fullRedemption_nonExpiredPrincipalToken_success() public {
        __test_sellPrincipalToken({_sellAll: true, _expiredPrincipalToken: false});
    }

    function test_sellPrincipalToken_partialRedemption_nonExpiredPrincipalToken_success() public {
        __test_sellPrincipalToken({_sellAll: false, _expiredPrincipalToken: false});
    }

    function test_sellPrincipalToken_fullRedemption_expiredPrincipalToken_success() public {
        __test_sellPrincipalToken({_sellAll: true, _expiredPrincipalToken: true});
    }

    function test_sellPrincipalToken_partialRedemption_expiredPrincipalToken_success() public {
        __test_sellPrincipalToken({_sellAll: false, _expiredPrincipalToken: true});
    }

    function test_sellPrincipalToken_nativeAsset_success() public {
        // If the native asset is a valid withdrawal token, run the test
        if (syToken.isValidTokenOut(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});

            uint256 wrappedNativeTokenBalancePre = wrappedNativeToken.balanceOf(vaultProxyAddress);

            __sellPrincipalToken({
                _withdrawalTokenAddress: PENDLE_NATIVE_ASSET_ADDRESS,
                _withdrawalAmount: IERC20(address(principalToken)).balanceOf(address(pendleV2ExternalPosition))
            });

            uint256 wrappedNativeTokenBalancePost = wrappedNativeToken.balanceOf(vaultProxyAddress);

            // Assert that the wrapped native token balance has increased
            assertGt(
                wrappedNativeTokenBalancePost, wrappedNativeTokenBalancePre, "Incorrect wrapped native token balance"
            );
        }
    }

    function test_addLiquidity_success() public {
        vm.expectEmit();
        emit OracleDurationForMarketAdded(address(market), pricingDuration);
        vm.expectEmit();
        emit LpTokenAdded(address(market));

        __addLiquidity();

        // Assert that the LP token has been added to the external position
        assertEq(toArray(address(market)), pendleV2ExternalPosition.getLPTokens());

        // Assert that the LP token value is accounted for in the EP
        uint256 lpTokenBalance = IERC20(address(market)).balanceOf(address(pendleV2ExternalPosition));

        uint256 expectedAssetAmount = lpTokenBalance
            * PendleLpOracleLib.getLpToAssetRate({
                market: IOracleLibPendleMarket(address(market)),
                duration: pricingDuration
            }) / ORACLE_RATE_PRECISION;

        // Assert that there is some LP balance in the EP
        assertGt(lpTokenBalance, 0, "Incorrect LP token balance");

        // Assert that the EP holds the LP token
        (address[] memory assets, uint256[] memory amounts) = pendleV2ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(address(underlyingAsset)), "Incorrect managed assets");
        assertEq(amounts, toArray(expectedAssetAmount), "Incorrect managed asset amounts");

        // Assert that the value of the LP is similar to the provided underlying
        assertApproxEqRel(depositAmount, amounts[0], WEI_ONE_PERCENT / 5);
    }

    function __test_removeLiquidity(bool _removeAll) private {
        __addLiquidity();

        uint256 lpTokenBalance = IERC20(address(market)).balanceOf(address(pendleV2ExternalPosition));
        uint256 withdrawalAmount = _removeAll ? lpTokenBalance : lpTokenBalance / 3;

        if (_removeAll) {
            // Expect the LP token to be removed from the EP
            vm.expectEmit();
            emit LpTokenRemoved(address(market));
        }

        uint256 preUnderlyingAssetBalance = underlyingAsset.balanceOf(vaultProxyAddress);

        uint256 expectedUnderlyingDelta = withdrawalAmount
            * PendleLpOracleLib.getLpToAssetRate({
                market: IOracleLibPendleMarket(address(market)),
                duration: pricingDuration
            }) / ORACLE_RATE_PRECISION;

        __removeLiquidity({_withdrawalAmount: withdrawalAmount});

        uint256 postUnderlyingAssetBalance = underlyingAsset.balanceOf(vaultProxyAddress);

        // Assert that the LP token has been removed from the external position
        if (_removeAll) {
            assertEq(0, pendleV2ExternalPosition.getLPTokens().length);
            // Assert that the EP holds no residual LP token or SY token balance;
            assertEq(0, IERC20(address(market)).balanceOf(address(pendleV2ExternalPosition)));
            assertEq(0, IERC20(address(syToken)).balanceOf(address(pendleV2ExternalPosition)));
        } else {
            assertEq(1, pendleV2ExternalPosition.getLPTokens().length);
        }

        // Assert that the withdrawn underlying matches what is expected from the LP token valuation
        assertApproxEqRel(
            postUnderlyingAssetBalance, preUnderlyingAssetBalance + expectedUnderlyingDelta, WEI_ONE_PERCENT / 100
        );
    }

    function test_removeLiquidity_removeAll_success() public {
        __test_removeLiquidity({_removeAll: true});
    }

    function test_removeLiquidity_removePartial_success() public {
        __test_removeLiquidity({_removeAll: false});
    }

    function test_claimRewards_success() public {
        address[] memory rewardTokens = market.getRewardTokens();

        // Only run test if there are reward tokens

        if (rewardTokens.length > 0) {
            // Provide liquidity to an LP so that rewards accrue.
            __addLiquidity();

            uint256[] memory rewardTokenBalancesPreClaim = new uint256[](rewardTokens.length);

            for (uint256 i; i < rewardTokens.length; i++) {
                rewardTokenBalancesPreClaim[i] = IERC20(rewardTokens[i]).balanceOf(vaultProxyAddress);
            }

            // Warp the time to allow rewards to accrue
            skip(50 days);

            // Check that rewards have accrued.
            // We update user rewards as per Pendle technical docs:
            // https://docs.pendle.finance/Developers/Contracts/TechnicalDetails#getting-up-to-dateaccruedrewardson-chain-applicable-to-sy-yt--lp
            IERC20(address(market)).transfer(address(pendleV2ExternalPosition), 0);
            uint256[] memory accruedRewards = syToken.accruedRewards(address(pendleV2ExternalPosition));

            // Only run the claimrewards test if rewards have accrued
            if (accruedRewards.length > 0) {
                __claimRewards(toArray(address(market)));

                for (uint256 i; i < rewardTokens.length; i++) {
                    assertGt(
                        IERC20(rewardTokens[i]).balanceOf(vaultProxyAddress),
                        rewardTokenBalancesPreClaim[i],
                        "Incorrect reward token balance"
                    );
                }
            }
        }
    }

    function test_multiplePositions_success() public {
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});
        __addLiquidity();

        (address[] memory assetsFirst, uint256[] memory amountsFirst) = pendleV2ExternalPosition.getManagedAssets();

        // PT and LP have same valuation asset so should only be 1 asset
        assertEq(assetsFirst, toArray(address(underlyingAsset)), "Incorrect managed assets");

        // Value of the EP should be roughly equal two twice the deposit amount (1x PT, 1x LP);
        assertApproxEqRel(depositAmount * 2, amountsFirst[0], WEI_ONE_PERCENT / 2);

        // Fully withdraw the LP
        __removeLiquidity({_withdrawalAmount: IERC20(address(market)).balanceOf(address(pendleV2ExternalPosition))});

        // LPToken should be removed from storage
        assertEq(pendleV2ExternalPosition.getLPTokens().length, 0, "Incorrect lpTokens length");

        // PT should still be in storage
        address[] memory storedPTs = pendleV2ExternalPosition.getPrincipalTokens();
        assertEq(storedPTs[0], address(principalToken));

        (address[] memory assetsSecond, uint256[] memory amountsSecond) = pendleV2ExternalPosition.getManagedAssets();
        assertEq(assetsSecond, toArray(address(underlyingAsset)), "Incorrect managed assets");

        // Value of the EP should be roughly equal a single deposit amount (the PT)
        assertApproxEqRel(depositAmount, amountsSecond[0], WEI_ONE_PERCENT / 2);

        // Buy the same PT again
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});

        (address[] memory assetsThird, uint256[] memory amountsThird) = pendleV2ExternalPosition.getManagedAssets();
        assertEq(assetsThird, toArray(address(underlyingAsset)), "Incorrect managed assets");

        // Value of the EP should be roughly equal 2 deposit amounts (2x PT)
        assertApproxEqRel(depositAmount * 2, amountsThird[0], WEI_ONE_PERCENT / 2);
    }
}

// Pendle weETH is a v3 market
contract PendleWeEthTestEthereum is PendleTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _pendleMarketFactoryAddresses: toArray(ETHEREUM_MARKET_FACTORY_V1, ETHEREUM_MARKET_FACTORY_V3),
            _pendlePtOracleAddress: ETHEREUM_PT_ORACLE,
            _pendleRouterAddress: ETHEREUM_ROUTER,
            _pendleMarketAddress: ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle weETH is a v3 market
contract PendleWeEthTestEthereumV4 is PendleTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _pendleMarketFactoryAddresses: toArray(ETHEREUM_MARKET_FACTORY_V1, ETHEREUM_MARKET_FACTORY_V3),
            _pendlePtOracleAddress: ETHEREUM_PT_ORACLE,
            _pendleRouterAddress: ETHEREUM_ROUTER,
            _pendleMarketAddress: ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle steth is a v1 market
contract PendleStethTestEthereum is PendleTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _pendleMarketFactoryAddresses: toArray(ETHEREUM_MARKET_FACTORY_V1, ETHEREUM_MARKET_FACTORY_V3),
            _pendlePtOracleAddress: ETHEREUM_PT_ORACLE,
            _pendleRouterAddress: ETHEREUM_ROUTER,
            _pendleMarketAddress: ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle steth is a v1 market
contract PendleStethTestEthereumV4 is PendleTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _pendleMarketFactoryAddresses: toArray(ETHEREUM_MARKET_FACTORY_V1, ETHEREUM_MARKET_FACTORY_V3),
            _pendlePtOracleAddress: ETHEREUM_PT_ORACLE,
            _pendleRouterAddress: ETHEREUM_ROUTER,
            _pendleMarketAddress: ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IPendleV2Position as IPendleV2PositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/pendle-v2/IPendleV2Position.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IPendleV2Market} from "tests/interfaces/external/IPendleV2Market.sol";
import {IPendleV2PrincipalToken} from "tests/interfaces/external/IPendleV2PrincipalToken.sol";
import {IPendleV2PyYtLpOracle} from "tests/interfaces/external/IPendleV2PyYtLpOracle.sol";
import {IPendleV2StandardizedYield} from "tests/interfaces/external/IPendleV2StandardizedYield.sol";
import {IPendleV2Router} from "tests/interfaces/external/IPendleV2Router.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IPendleV2MarketRegistry} from "tests/interfaces/internal/IPendleV2MarketRegistry.sol";
import {IPendleV2PositionLib} from "tests/interfaces/internal/IPendleV2PositionLib.sol";
import {IPendleV2PositionParser} from "tests/interfaces/internal/IPendleV2PositionParser.sol";
import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";
import {PendleV2Utils} from "./PendleV2Utils.sol";

// ETHEREUM MAINNET CONSTANTS
address constant ETHEREUM_MARKET_FACTORY_V1 = 0x27b1dAcd74688aF24a64BD3C9C1B143118740784;
address constant ETHEREUM_MARKET_FACTORY_V3 = 0x1A6fCc85557BC4fB7B534ed835a03EF056552D52;
address constant ETHEREUM_PY_YT_LP_ORACLE = 0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2;
address constant ETHEREUM_ROUTER = 0x888888888889758F76e7103c6CbF23ABbF58F946;
address constant ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS = 0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2;
address constant ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS = 0xF32e58F92e60f4b0A37A69b95d642A471365EAe8;
address constant ETHEREUM_FUSDC_26DEC2024_MARKET_ADDRESS = 0xcB71c2A73fd7588E1599DF90b88de2316585A860;

// ARBITRUM CONSTANTS
address constant ARBITRUM_MARKET_FACTORY_V3 = 0x2FCb47B58350cD377f94d3821e7373Df60bD9Ced;
address constant ARBITRUM_PY_YT_LP_ORACLE = 0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2;
address constant ARBITRUM_ROUTER = 0x888888888889758F76e7103c6CbF23ABbF58F946;
address constant ARBITRUM_EETH_25SEPT2024_MARKET_ADDRESS = 0xf9F9779d8fF604732EBA9AD345E6A27EF5c2a9d6;
address constant ARBITRUM_EZETH_25SEPT2024_MARKET_ADDRESS = 0x35f3dB08a6e9cB4391348b0B404F493E7ae264c0;

uint256 constant ORACLE_RATE_PRECISION = 1e18;
address constant PENDLE_NATIVE_ASSET_ADDRESS = address(0);

// TODO: Add test instance for a market that uses the native asset as its oracle rate asset
abstract contract PendleTestBase is IntegrationTest, PendleV2Utils {
    using AddressArrayLib for address[];

    event MigratedToVault();

    event PrincipalTokenAdded(address indexed principalToken);

    event PrincipalTokenRemoved(address indexed principalToken);

    event LpTokenAdded(address indexed lpToken);

    event LpTokenRemoved(address indexed lpToken);

    uint256 internal pendleSyTokensListId;
    uint256 internal pendleV2TypeId;
    IPendleV2MarketRegistry internal pendleV2MarketRegistry;
    IPendleV2PositionLib internal pendleV2PositionLib;
    IPendleV2PositionParser internal pendleV2PositionParser;
    IPendleV2PositionLib internal pendleV2ExternalPosition;

    IAddressListRegistryProd internal addressListRegistry;
    IERC20 internal underlyingAsset;
    IPendleV2Market internal market;
    IPendleV2PrincipalToken internal principalToken;
    IPendleV2PyYtLpOracle internal pendleOracle;
    IPendleV2Router internal pendleRouter;
    IPendleV2Router.ApproxParams internal guessPtOut;
    IPendleV2StandardizedYield internal syToken;
    uint256 internal depositAmount;
    uint32 internal pricingDuration;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal listOwner;
    address internal vaultProxyAddress;
    IExternalPositionManager internal externalPositionManager;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        address _pendleOracleAddress,
        address _pendleRouterAddress,
        address _pendleMarketAddress,
        uint32 _pricingDuration
    ) internal {
        // Assign vars from inputs
        version = _version;
        pendleOracle = IPendleV2PyYtLpOracle(_pendleOracleAddress);
        pendleRouter = IPendleV2Router(_pendleRouterAddress);
        market = IPendleV2Market(_pendleMarketAddress);
        pricingDuration = _pricingDuration;
        listOwner = makeAddr("ListOwner");

        // Validate that the market has at least one reward token
        // @dev This can be moved to specific market setup, we just need at least one market per version with reward tokens
        require(market.getRewardTokens().length > 0, "__initialize: Market has no reward tokens");

        // Assign other misc vars
        externalPositionManager = IExternalPositionManager(getExternalPositionManagerAddressForVersion(version));
        (syToken, principalToken,) = market.readTokens();
        address underlyingAssetAddress = syToken.yieldToken();
        // If underlyingAssetAddress is the 0 address, this indicates that the NATIVE_ASSET is the reference asset
        if (underlyingAssetAddress == PENDLE_NATIVE_ASSET_ADDRESS) {
            underlyingAssetAddress = address(wrappedNativeToken);
        }
        underlyingAsset = IERC20(underlyingAssetAddress);
        // Default generic guessPtOut. In a production setting, these settings can be calculated offchain to reduce gas usage.
        // src: https://docs.pendle.finance/Developers/Contracts/PendleRouter#approxparams
        guessPtOut = IPendleV2Router.ApproxParams({
            guessMin: 0,
            guessMax: type(uint256).max,
            guessOffchain: 0,
            maxIteration: 256,
            eps: 1e15
        });

        // Add the market's underlyingAsset to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: underlyingAssetAddress,
            _skipIfRegistered: true
        });

        // Deploy and register all Pendle V2 contracts
        (pendleV2MarketRegistry, pendleV2PositionLib, pendleV2PositionParser, pendleSyTokensListId, pendleV2TypeId) =
        deployPendleV2({
            _pendleOracleAddress: _pendleOracleAddress,
            _pendleRouterAddress: _pendleRouterAddress,
            _wrappedNativeAssetAddress: address(wrappedNativeToken)
        });

        // Create a fund and add an empty Pendle position
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

        // Register the PT and market for the fund (call directly from vault)
        vm.prank(vaultProxyAddress);
        pendleV2MarketRegistry.updateMarketsForCaller({
            _updateMarketInputs: __encodePendleV2MarketRegistryUpdate({
                _marketAddress: address(market),
                _duration: pricingDuration
            }),
            _skipValidation: false
        });

        // Increase the vault's balances of tokens to use in Pendle actions
        increaseTokenBalance({_token: wrappedNativeToken, _to: vaultProxyAddress, _amount: 100 ether});
        increaseTokenBalance({
            _token: underlyingAsset,
            _to: vaultProxyAddress,
            _amount: 100 * assetUnit(underlyingAsset)
        });

        // Set a deposit amount to be used for the tests
        depositAmount = underlyingAsset.balanceOf(vaultProxyAddress) / 7;
    }

    // DEPLOYMENT HELPERS

    function deployPendleV2(
        address _pendleOracleAddress,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    )
        public
        returns (
            IPendleV2MarketRegistry pendleV2MarketRegistry_,
            IPendleV2PositionLib pendleV2PositionLib_,
            IPendleV2PositionParser pendleV2PositionParser_,
            uint256 syTokensListId_,
            uint256 typeId_
        )
    {
        // Create a new AddressListRegistry list containing the allowed syToken
        uint256 pendlePeggedSyTokensListId = core.persistent.addressListRegistry.createList({
            _owner: listOwner,
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
            _initialItems: toArray(address(syToken))
        });

        pendleV2MarketRegistry_ = __deployPendleV2MarketRegistry({_pendleOracleAddress: _pendleOracleAddress});

        pendleV2PositionLib_ = deployPendleV2PositionLib({
            _pendleMarketRegistryAddress: address(pendleV2MarketRegistry_),
            _pendleOracleAddress: _pendleOracleAddress,
            _pendleRouterAddress: _pendleRouterAddress,
            _pendlePeggedSyTokensListId: pendlePeggedSyTokensListId,
            _wrappedNativeAssetAddress: _wrappedNativeAssetAddress
        });

        pendleV2PositionParser_ = deployPendleV2PositionParser({_wrappedNativeAssetAddress: _wrappedNativeAssetAddress});

        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "PENDLE_V2",
            _lib: address(pendleV2PositionLib_),
            _parser: address(pendleV2PositionParser_)
        });

        return (
            pendleV2MarketRegistry_, pendleV2PositionLib_, pendleV2PositionParser_, pendlePeggedSyTokensListId, typeId_
        );
    }

    function deployPendleV2PositionLib(
        address _pendleMarketRegistryAddress,
        address _pendleOracleAddress,
        uint256 _pendlePeggedSyTokensListId,
        address _pendleRouterAddress,
        address _wrappedNativeAssetAddress
    ) public returns (IPendleV2PositionLib) {
        bytes memory args = abi.encode(
            address(core.persistent.addressListRegistry),
            _pendleMarketRegistryAddress,
            _pendleOracleAddress,
            _pendlePeggedSyTokensListId,
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

    function __buyPrincipalToken(address _depositTokenAddress) private {
        bytes memory actionArgs = abi.encode(market, _depositTokenAddress, depositAmount, guessPtOut, 0);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.BuyPrincipalToken),
            _actionArgs: actionArgs
        });
    }

    function __sellPrincipalToken(address _withdrawalTokenAddress, uint256 _withdrawalAmount) private {
        bytes memory actionArgs = abi.encode(market, _withdrawalTokenAddress, _withdrawalAmount, 0);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.SellPrincipalToken),
            _actionArgs: actionArgs
        });
    }

    function __addLiquidity() private {
        bytes memory actionArgs = abi.encode(market, underlyingAsset, depositAmount, guessPtOut, 0);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.AddLiquidity),
            _actionArgs: actionArgs
        });
    }

    function __removeLiquidity(uint256 _withdrawalAmount) private {
        bytes memory actionArgs = abi.encode(market, underlyingAsset, _withdrawalAmount, 0, 0);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.RemoveLiquidity),
            _actionArgs: actionArgs
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

    function __migrateToVault() private {
        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(pendleV2ExternalPosition),
            _actionId: uint256(IPendleV2PositionProd.Actions.MigrateToVault),
            _actionArgs: ""
        });
    }

    // TESTS

    function __test_buyPrincipalToken_success(address _depositTokenAddress) private {
        vm.recordLogs();

        // Assert that the AddPrincipalToken event has been emitted
        expectEmit(address(pendleV2ExternalPosition));
        emit PrincipalTokenAdded(address(principalToken));

        __buyPrincipalToken({_depositTokenAddress: _depositTokenAddress});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        // Assert that the principalToken has been added to the external position
        assertEq(toArray(address(principalToken)), pendleV2ExternalPosition.getPrincipalTokens());

        // Assert that the PrincipalToken value is accounted for in the EP
        address expectedAsset = syToken.yieldToken();
        uint256 principalTokenBalance = IERC20(address(principalToken)).balanceOf(address(pendleV2ExternalPosition));

        // Assert that there is some PT balance in the EP
        assertGt(principalTokenBalance, 0, "Incorrect principalToken balance");

        uint256 expectedAssetAmount = syToken.previewRedeem({
            _tokenOut: address(underlyingAsset),
            _amountSharesToRedeem: principalTokenBalance
                * pendleOracle.getPtToSyRate({_market: address(market), _duration: pricingDuration}) / ORACLE_RATE_PRECISION
        });

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

    function test_buyPrincipalToken_successUnderlyingAsset() public {
        __test_buyPrincipalToken_success({_depositTokenAddress: address(underlyingAsset)});
    }

    // Test that a principal token can be bought through the native asset.
    function test_buyPrincipalToken_successNativeAsset() public {
        // Run the test conditionally if the token supports depositing in the the native asset.
        if (syToken.isValidTokenIn(PENDLE_NATIVE_ASSET_ADDRESS)) {
            __test_buyPrincipalToken_success({_depositTokenAddress: NATIVE_ASSET_ADDRESS});
        }
    }

    function test_buyPrincipalToken_failsWithDifferentPtMarket() public {
        // Clone the market
        address altMarketForPtAddress = makeAddr("AltMarketForPt");
        vm.etch(altMarketForPtAddress, address(market).code);

        // Link PT to the cloned market
        vm.prank(vaultProxyAddress);
        pendleV2MarketRegistry.updateMarketsForCaller({
            _updateMarketInputs: __encodePendleV2MarketRegistryUpdate({
                _marketAddress: altMarketForPtAddress,
                _duration: pricingDuration
            }),
            _skipValidation: true
        });

        // Should fail
        vm.expectRevert(formatError("__validateMarketForPt: Unsupported market"));
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});
    }

    function test_buyPrincipalToken_failsWithUnsupportedSyToken() public {
        // Remove the SY Token from the list
        vm.prank(listOwner);
        core.persistent.addressListRegistry.removeFromList({
            _id: pendleSyTokensListId,
            _items: toArray(address(syToken))
        });

        // Should fail
        vm.expectRevert(formatError("__validateSyToken: Unsupported SY Token"));
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});
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

        uint256 expectedUnderlyingDelta = syToken.previewRedeem({
            _tokenOut: address(underlyingAsset),
            _amountSharesToRedeem: withdrawalAmount
                * pendleOracle.getPtToSyRate({_market: address(market), _duration: pricingDuration}) / ORACLE_RATE_PRECISION
        });

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

    function test_sellPrincipalToken_successFullRedemptionNonExpiredPrincipalToken() public {
        __test_sellPrincipalToken({_sellAll: true, _expiredPrincipalToken: false});
    }

    function test_sellPrincipalToken_successPartialRedemptionNonExpiredPrincipalToken() public {
        __test_sellPrincipalToken({_sellAll: false, _expiredPrincipalToken: false});
    }

    function test_sellPrincipalToken_successFullRedemptionExpiredPrincipalToken() public {
        __test_sellPrincipalToken({_sellAll: true, _expiredPrincipalToken: true});
    }

    function test_sellPrincipalToken_successPartialRedemptionExpiredPrincipalToken() public {
        __test_sellPrincipalToken({_sellAll: false, _expiredPrincipalToken: true});
    }

    function test_sellPrincipalToken_successNativeAsset() public {
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

    function test_sellPrincipalToken_failsWithDifferentPtMarket() public {
        // Acquire PT
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});
        uint256 principalTokenBalance = IERC20(address(principalToken)).balanceOf(address(pendleV2ExternalPosition));

        // Clone the market
        address altMarketForPtAddress = makeAddr("AltMarketForPt");
        vm.etch(altMarketForPtAddress, address(market).code);

        // Link PT to the cloned market
        vm.prank(vaultProxyAddress);
        pendleV2MarketRegistry.updateMarketsForCaller({
            _updateMarketInputs: __encodePendleV2MarketRegistryUpdate({
                _marketAddress: altMarketForPtAddress,
                _duration: pricingDuration
            }),
            _skipValidation: true
        });

        // Should fail
        vm.expectRevert(formatError("__validateMarketForPt: Unsupported market"));
        __sellPrincipalToken({
            _withdrawalTokenAddress: address(underlyingAsset),
            _withdrawalAmount: principalTokenBalance
        });
    }

    function test_addLiquidity_success() public {
        vm.expectEmit();
        emit LpTokenAdded(address(market));

        __addLiquidity();

        // Assert that the LP token has been added to the external position
        assertEq(toArray(address(market)), pendleV2ExternalPosition.getLPTokens());

        // Assert that the LP token value is accounted for in the EP
        uint256 lpTokenBalance = IERC20(address(market)).balanceOf(address(pendleV2ExternalPosition));

        uint256 expectedAssetAmount = syToken.previewRedeem({
            _tokenOut: address(underlyingAsset),
            _amountSharesToRedeem: lpTokenBalance
                * pendleOracle.getLpToSyRate({_market: address(market), _duration: pricingDuration}) / ORACLE_RATE_PRECISION
        });

        // Assert that there is some LP balance in the EP
        assertGt(lpTokenBalance, 0, "Incorrect LP token balance");

        // Assert that the EP holds the LP token
        (address[] memory assets, uint256[] memory amounts) = pendleV2ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(address(underlyingAsset)), "Incorrect managed assets");
        assertEq(amounts, toArray(expectedAssetAmount), "Incorrect managed asset amounts");

        // Assert that the value of the LP is similar to the provided underlying
        assertApproxEqRel(depositAmount, amounts[0], WEI_ONE_PERCENT / 5);
    }

    function test_addLiquidity_failsWithZeroMarketDuration() public {
        // Set market duration to 0
        vm.prank(vaultProxyAddress);
        pendleV2MarketRegistry.updateMarketsForCaller({
            _updateMarketInputs: __encodePendleV2MarketRegistryUpdate({_marketAddress: address(market), _duration: 0}),
            _skipValidation: false
        });

        // Should fail
        vm.expectRevert(formatError("__addLiquidity: Unsupported market"));
        __addLiquidity();
    }

    function test_addLiquidity_failsWithUnsupportedSyToken() public {
        // Remove the SY Token from the list
        vm.prank(listOwner);
        core.persistent.addressListRegistry.removeFromList({
            _id: pendleSyTokensListId,
            _items: toArray(address(syToken))
        });

        // Should fail
        vm.expectRevert(formatError("__validateSyToken: Unsupported SY Token"));
        __addLiquidity();
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

        uint256 expectedUnderlyingDelta = syToken.previewRedeem({
            _tokenOut: address(underlyingAsset),
            _amountSharesToRedeem: withdrawalAmount
                * pendleOracle.getLpToSyRate({_market: address(market), _duration: pricingDuration}) / ORACLE_RATE_PRECISION
        });

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

    function test_removeLiquidity_successRemoveAll() public {
        __test_removeLiquidity({_removeAll: true});
    }

    function test_removeLiquidity_successRemovePartial() public {
        __test_removeLiquidity({_removeAll: false});
    }

    function test_removeLiquidity_failsWithUnheldLpToken() public {
        // Should fail
        vm.expectRevert(formatError("__removeLiquidity: Unsupported market"));
        __removeLiquidity({_withdrawalAmount: 1});
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

    function test_claimRewards_successWithPtAndLpAsRewards() public {
        // Acquire PT and LP so that: (1) rewards accrue and (2) we can test that PT and LP rewards will not be sent to the vault
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});
        __addLiquidity();

        address[] memory originalRewardTokens = market.getRewardTokens();

        // Add PT and LP to the list of reward tokens and mock the rewardTokens callback
        address[] memory rewardTokensPlusPtAndLp =
            originalRewardTokens.mergeArray(toArray(address(principalToken), address(market)));
        vm.mockCall({
            callee: address(market),
            data: abi.encodeWithSelector(IPendleV2Market.getRewardTokens.selector),
            returnData: abi.encode(rewardTokensPlusPtAndLp)
        });
        assertEq(market.getRewardTokens(), rewardTokensPlusPtAndLp);

        // Checkpoint pre-claim balances of normal reward tokens
        uint256[] memory originalRewardTokenBalancesPreClaim = new uint256[](originalRewardTokens.length);
        for (uint256 i; i < originalRewardTokens.length; i++) {
            originalRewardTokenBalancesPreClaim[i] = IERC20(originalRewardTokens[i]).balanceOf(vaultProxyAddress);
        }

        // Warp the time to allow rewards to accrue
        skip(50 days);

        // Update user rewards as per Pendle technical docs:
        // https://docs.pendle.finance/Developers/Contracts/TechnicalDetails#getting-up-to-dateaccruedrewardson-chain-applicable-to-sy-yt--lp
        IERC20(address(market)).transfer(address(pendleV2ExternalPosition), 0);

        __claimRewards(toArray(address(market)));

        // TODO: blocked since rewards don't accrue in these tests
        // Assert that normal rewards tokens were sent to the vault
        // for (uint256 i; i < originalRewardTokens.length; i++) {
        //     assertGt(
        //         IERC20(originalRewardTokens[i]).balanceOf(vaultProxyAddress),
        //         originalRewardTokenBalancesPreClaim[i],
        //         "Incorrect reward token balance"
        //     );
        // }

        // Assert that the PT and LP tokens have not been sent to the vault
        assertEq(IERC20(address(principalToken)).balanceOf(vaultProxyAddress), 0);
        assertEq(IERC20(address(market)).balanceOf(vaultProxyAddress), 0);
    }

    function test_migrateToVault_success() public {
        // Acquire PT and LP
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});
        __addLiquidity();

        uint256 ptBalance = IERC20(address(principalToken)).balanceOf(address(pendleV2ExternalPosition));
        uint256 lpBalance = IERC20(address(market)).balanceOf(address(pendleV2ExternalPosition));
        assertGt(ptBalance, 0, "No starting principalToken balance");
        assertGt(lpBalance, 0, "No starting LP balance");

        vm.recordLogs();

        // Pre-assert event
        expectEmit(address(pendleV2ExternalPosition));
        emit MigratedToVault();

        // Migrate the external position to the vault
        __migrateToVault();

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(principalToken), address(market))
        });

        // Assert that the PT and LP tokens have been sent to the vault
        assertEq(
            IERC20(address(principalToken)).balanceOf(vaultProxyAddress), ptBalance, "Incorrect principalToken balance"
        );
        assertEq(IERC20(address(market)).balanceOf(vaultProxyAddress), lpBalance, "Incorrect LP balance");

        // Assert that storage is cleared in the EP
        assertEq(pendleV2ExternalPosition.getPrincipalTokens().length, 0, "Incorrect principalTokens length");
        assertEq(pendleV2ExternalPosition.getLPTokens().length, 0, "Incorrect lpTokens length");

        // Assert that position value is 0
        (address[] memory assets, uint256[] memory amounts) = pendleV2ExternalPosition.getManagedAssets();
        assertEq(assets.length, 0, "Incorrect managed assets");
        assertEq(amounts.length, 0, "Incorrect managed asset amounts");
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
        assertApproxEqRel(depositAmount * 2, amountsThird[0], WEI_ONE_PERCENT);
    }

    function test_positionValue_failsWithZeroDurationForLpToken() public {
        __addLiquidity();

        // Set market duration to 0
        vm.prank(vaultProxyAddress);
        pendleV2MarketRegistry.updateMarketsForCaller({
            _updateMarketInputs: __encodePendleV2MarketRegistryUpdate({_marketAddress: address(market), _duration: 0}),
            _skipValidation: false
        });

        // Should fail
        vm.expectRevert("__getLpTokenValue: Duration not registered");
        pendleV2ExternalPosition.getManagedAssets();
    }

    function test_positionValue_failsWithZeroDurationForPt() public {
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});

        // Set market duration to 0
        vm.prank(vaultProxyAddress);
        pendleV2MarketRegistry.updateMarketsForCaller({
            _updateMarketInputs: __encodePendleV2MarketRegistryUpdate({_marketAddress: address(market), _duration: 0}),
            _skipValidation: false
        });

        // Should fail
        vm.expectRevert("__getPrincipalTokenValue: Duration not registered");
        pendleV2ExternalPosition.getManagedAssets();
    }

    function test_positionValue_failsWithUnsupportedSyToken() public {
        __buyPrincipalToken({_depositTokenAddress: address(underlyingAsset)});

        // Remove the SY Token from the list
        vm.prank(listOwner);
        core.persistent.addressListRegistry.removeFromList({
            _id: pendleSyTokensListId,
            _items: toArray(address(syToken))
        });

        // Should fail
        vm.expectRevert("__validateSyToken: Unsupported SY Token");
        pendleV2ExternalPosition.getManagedAssets();
    }
}

abstract contract PendleTestEthereum is PendleTestBase {
    function __initializeEthereum(EnzymeVersion _version, address _pendleMarketAddress, uint32 _pricingDuration)
        internal
    {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TIME_SENSITIVE_PENDLE);

        __initialize({
            _version: _version,
            _pendleOracleAddress: ETHEREUM_PY_YT_LP_ORACLE,
            _pendleRouterAddress: ETHEREUM_ROUTER,
            _pendleMarketAddress: _pendleMarketAddress,
            _pricingDuration: _pricingDuration
        });
    }
}

abstract contract PendleTestArbitrum is PendleTestBase {
    function __initializeArbitrum(EnzymeVersion _version, address _pendleMarketAddress, uint32 _pricingDuration)
        internal
    {
        setUpArbitrumEnvironment(ARBITRUM_BLOCK_TIME_SENSITIVE);

        __initialize({
            _version: _version,
            _pendleOracleAddress: ARBITRUM_PY_YT_LP_ORACLE,
            _pendleRouterAddress: ARBITRUM_ROUTER,
            _pendleMarketAddress: _pendleMarketAddress,
            _pricingDuration: _pricingDuration
        });
    }
}

// Pendle weETH is a v3 market
contract PendleWeEthTestEthereum is PendleTestEthereum {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle weETH is a v3 market
contract PendleWeEthTestEthereumV4 is PendleTestEthereum {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.V4,
            _pendleMarketAddress: ETHEREUM_WEETH_27JUN2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle steth is a v1 market
contract PendleStethTestEthereum is PendleTestEthereum {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle steth is a v1 market
contract PendleStethTestEthereumV4 is PendleTestEthereum {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.V4,
            _pendleMarketAddress: ETHEREUM_STETH_26DEC2025_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle FUSDc is a market where the decimals of the yieldToken aren't equal to the decimals of the asset returned by assetInfo
contract PendleFUsdcTestEthereum is PendleTestEthereum {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ETHEREUM_FUSDC_26DEC2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

// Pendle FUSDc is a market where the decimals of the yieldToken aren't equal to the decimals of the asset returned by assetInfo
contract PendleFUsdcTestEthereumV4 is PendleTestEthereum {
    function setUp() public override {
        __initializeEthereum({
            _version: EnzymeVersion.V4,
            _pendleMarketAddress: ETHEREUM_FUSDC_26DEC2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

contract PendleEzethTestArbitrum is PendleTestArbitrum {
    function setUp() public override {
        __initializeArbitrum({
            _version: EnzymeVersion.Current,
            _pendleMarketAddress: ARBITRUM_EZETH_25SEPT2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

contract PendleEEthTestArbitrumV4 is PendleTestArbitrum {
    function setUp() public override {
        __initializeArbitrum({
            _version: EnzymeVersion.V4,
            _pendleMarketAddress: ARBITRUM_EZETH_25SEPT2024_MARKET_ADDRESS,
            _pricingDuration: 900 // 15 minutes
        });
    }
}

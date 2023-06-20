// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {INotionalV3Router} from "tests/interfaces/external/INotionalV3Router.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {INotionalV3PositionLib} from "tests/interfaces/internal/INotionalV3PositionLib.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

// TODO: test slippage param

// NOTIONAL LOGIC AND CONFIG

uint16 constant CURRENCY_ID_ETH = 1;
uint16 constant CURRENCY_ID_DAI = 2;
uint16 constant CURRENCY_ID_USDC = 3;
address constant ETH_CASH_TOKEN_ADDRESS = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5; // cETH
address constant USDC_CASH_TOKEN_ADDRESS = 0x39AA39c021dfbaE8faC545936693aC917d5E7563; // cUSDC

// For F_CASH_ASSET_TYPE, see https://github.com/notional-finance/contracts-v2/blob/d89be9474e181b322480830501728ea625e853d0/contracts/global/Constants.sol#L95
uint8 constant F_CASH_ASSET_TYPE = 1;
uint256 constant F_CASH_UNIT = 10 ** 8;
address constant NOTIONAL_ROUTER = 0x1344A36A1B56144C3Bc62E7757377D288fDE0369;

////////////////
// TEST BASES //
////////////////

abstract contract TestBase is IntegrationTest {
    enum Actions {
        AddCollateral,
        Lend,
        Redeem,
        Borrow
    }

    INotionalV3PositionLib internal notionalV3Position;
    INotionalV3Router internal notionalV3Router = INotionalV3Router(NOTIONAL_ROUTER);

    address internal fundOwner;
    IComptroller internal comptrollerProxy;
    IVault internal vaultProxy;

    IERC20 internal dai;
    IERC20 internal usdc;

    function setUp() public virtual override {
        // TODO: using a block before Notional v2 hotfixes were made.
        // Change to latest block once we upgrade to v3
        setUpMainnetEnvironment(ETHEREUM_BLOCK_2023_01_13);

        dai = IERC20(ETHEREUM_DAI);
        usdc = IERC20(ETHEREUM_USDC);

        // Create a fund, seeded with WETH
        fundOwner = makeAddr("FundOwner");
        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: fundOwner,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 1000 ether,
            _sharesBuyer: fundOwner
        });

        // Seed other assets to the fund
        uint256 usdcDealAmount = assetUnit(usdc) * 1_000_000;
        deal({token: address(usdc), to: address(vaultProxy), give: usdcDealAmount});
        uint256 daiDealAmount = assetUnit(dai) * 1_000_000;
        deal({token: address(dai), to: address(vaultProxy), give: daiDealAmount});

        // Deploy all EP dependencies
        uint256 typeId = __deployPositionType();

        // Create an empty EP for the fund
        vm.prank(fundOwner);
        notionalV3Position = INotionalV3PositionLib(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: comptrollerProxy,
                _typeId: typeId,
                _initializationData: "",
                _callOnExternalPositionCallArgs: ""
            })
        );
    }

    // DEPLOYMENT HELPERS

    function __deployLib(address _notionalContractAddress, IERC20 _wrappedNativeAsset)
        internal
        returns (address libAddress_)
    {
        bytes memory args = abi.encode(_notionalContractAddress, _wrappedNativeAsset);

        return deployCode("NotionalV2PositionLib.sol", args);
    }

    function __deployParser(address _notionalContractAddress, IERC20 _wrappedNativeAsset)
        internal
        returns (address parserAddress_)
    {
        bytes memory args = abi.encode(_notionalContractAddress, _wrappedNativeAsset);

        return deployCode("NotionalV2PositionParser.sol", args);
    }

    function __deployPositionType() internal returns (uint256 typeId_) {
        address notionalContractAddress = NOTIONAL_ROUTER;
        IERC20 wrappedNativeAsset = wethToken;

        // Deploy EP type contracts
        address libAddress =
            __deployLib({_notionalContractAddress: notionalContractAddress, _wrappedNativeAsset: wrappedNativeAsset});
        address parserAddress =
            __deployParser({_notionalContractAddress: notionalContractAddress, _wrappedNativeAsset: wrappedNativeAsset});

        // Register EP type
        return registerExternalPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _label: "NOTIONAL_V3",
            _lib: libAddress,
            _parser: parserAddress
        });
    }

    // ACTION HELPERS

    function __addCollateral(uint16 _currencyId, uint256 _collateralAssetAmount) internal {
        bytes memory actionArgs = abi.encode(_currencyId, _collateralAssetAmount);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(notionalV3Position),
            _actionId: uint256(Actions.AddCollateral),
            _actionArgs: actionArgs
        });
    }

    function __borrow(
        uint16 _borrowCurrencyId,
        bytes32 _encodedBorrowTrade,
        uint16 _collateralCurrencyId,
        uint256 _collateralAssetAmount
    ) internal {
        bytes memory actionArgs =
            abi.encode(_borrowCurrencyId, _encodedBorrowTrade, _collateralCurrencyId, _collateralAssetAmount);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(notionalV3Position),
            _actionId: uint256(Actions.Borrow),
            _actionArgs: actionArgs
        });
    }

    function __lend(uint16 _currencyId, uint256 _underlyingTokenAmount, bytes32 _encodedLendTrade) internal {
        bytes memory actionArgs = abi.encode(_currencyId, _underlyingTokenAmount, _encodedLendTrade);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(notionalV3Position),
            _actionId: uint256(Actions.Lend),
            _actionArgs: actionArgs
        });
    }

    function __redeem(uint16 _currencyId, uint88 _yieldTokenAmount) internal {
        bytes memory actionArgs = abi.encode(_currencyId, _yieldTokenAmount);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(notionalV3Position),
            _actionId: uint256(Actions.Redeem),
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __convertFCashToUnderlying(uint256 _fCashAmount, IERC20 _underlyingAsset)
        internal
        view
        returns (uint256 underlyingAmount_)
    {
        return _fCashAmount * assetUnit(_underlyingAsset) / F_CASH_UNIT;
    }

    function __encodeTrade(
        INotionalV3Router.TradeActionType _tradeActionType,
        INotionalV3Router.MarketIndex _marketIndex,
        uint256 _fCashAmount,
        uint32 _minSlippage
    ) internal pure returns (bytes32 encodedTrade_) {
        return bytes32(abi.encodePacked(_tradeActionType, _marketIndex, uint88(_fCashAmount), _minSlippage, uint120(0)));
    }

    function __getMarketMaturity(uint16 _currencyId, INotionalV3Router.MarketIndex _marketIndex)
        internal
        view
        returns (uint256 maturity_)
    {
        INotionalV3Router.MarketParameters[] memory activeMarkets = notionalV3Router.getActiveMarkets(_currencyId);

        return activeMarkets[uint256(_marketIndex) - 1].maturity;
    }

    function __settleAllMarkets() internal {
        notionalV3Router.initializeMarkets({_currencyId: CURRENCY_ID_ETH, _isFirstInit: false});
        notionalV3Router.initializeMarkets({_currencyId: CURRENCY_ID_USDC, _isFirstInit: false});
        notionalV3Router.initializeMarkets({_currencyId: CURRENCY_ID_DAI, _isFirstInit: false});

        notionalV3Router.settleAccount(address(notionalV3Position));
    }
}

/////////////
// ACTIONS //
/////////////

contract AddCollateralTest is TestBase {
    function test_successWithERC20() public {
        __successTest({_currencyId: CURRENCY_ID_USDC, _collateralAsset: usdc});
    }

    function test_successWithNativeAsset() public {
        __successTest({_currencyId: CURRENCY_ID_ETH, _collateralAsset: wethToken});
    }

    function __successTest(uint16 _currencyId, IERC20 _collateralAsset) private {
        uint256 collateralAssetAmount = assetUnit(_collateralAsset) * 11;

        uint256 preTxVaultCollateralAssetBal = _collateralAsset.balanceOf(address(vaultProxy));

        __addCollateral({_currencyId: _currencyId, _collateralAssetAmount: collateralAssetAmount});

        // Assert the collateral has posted correctly to Notional
        // Note: Notional stores collateral as "cash" tokens, i.e., wrapped as a cToken
        (int256 cashBalance,,) =
            notionalV3Router.getAccountBalance({_currencyId: _currencyId, _account: address(notionalV3Position)});
        // TODO: make this assertion exact for collateral asset value
        assertTrue(cashBalance > 0);

        // Assert the exact collateral amount has left the vault
        assertEq(_collateralAsset.balanceOf(address(vaultProxy)), preTxVaultCollateralAssetBal - collateralAssetAmount);
    }
}

contract LendTest is TestBase {
    function test_successWithERC20() public {
        __successTest({_currencyId: CURRENCY_ID_USDC, _underlyingAsset: usdc});
    }

    function test_successWithNativeAsset() public {
        __successTest({_currencyId: CURRENCY_ID_ETH, _underlyingAsset: wethToken});
    }

    function __successTest(uint16 _currencyId, IERC20 _underlyingAsset) private {
        INotionalV3Router.MarketIndex marketIndex = INotionalV3Router.MarketIndex.SixMonths;

        uint256 lendUnits = 11;
        uint256 lendAmount = lendUnits * assetUnit(_underlyingAsset);
        uint256 fCashAmount = lendUnits * F_CASH_UNIT;

        bytes32 encodedTrade = __encodeTrade({
            _tradeActionType: INotionalV3Router.TradeActionType.Lend,
            _marketIndex: marketIndex,
            _fCashAmount: fCashAmount,
            _minSlippage: 0
        });

        uint256 preTxVaultUnderlyingBal = _underlyingAsset.balanceOf(address(vaultProxy));

        __lend({_currencyId: _currencyId, _underlyingTokenAmount: lendAmount, _encodedLendTrade: encodedTrade});

        uint256 postTxPositionUnderlyingBal = _underlyingAsset.balanceOf(address(notionalV3Position));
        uint256 postTxVaultUnderlyingBal = _underlyingAsset.balanceOf(address(vaultProxy));

        // Assert the expected Notional account portfolio state
        INotionalV3Router.PortfolioAsset[] memory portfolioAfter =
            notionalV3Router.getAccountPortfolio(address(notionalV3Position));
        assertEq(portfolioAfter.length, 1);
        assertEq(portfolioAfter[0].currencyId, uint256(_currencyId));
        assertEq(portfolioAfter[0].maturity, __getMarketMaturity({_currencyId: _currencyId, _marketIndex: marketIndex}));
        assertEq(portfolioAfter[0].assetType, F_CASH_ASSET_TYPE);
        assertEq(portfolioAfter[0].notional, int256(fCashAmount));

        // Slightly less of the underlying asset should have been used than specified,
        // with the difference returned to the vault
        assertApproxEqRel(preTxVaultUnderlyingBal - postTxVaultUnderlyingBal, lendAmount, WEI_ONE_PERCENT * 5);
        assertEq(postTxPositionUnderlyingBal, 0);
    }
}

contract BorrowTest is TestBase {
    function test_successWithBorrowedERC20AndFCashCollateral() public {
        IERC20 lendAsset = usdc;
        uint16 lendCurrencyId = CURRENCY_ID_USDC;
        IERC20 borrowAsset = dai;
        uint16 borrowCurrencyId = CURRENCY_ID_DAI;

        // 1. Lend to create fCash collateral

        uint256 lendUnits = 100_000;
        uint256 lendAmount = lendUnits * assetUnit(lendAsset);
        bytes32 encodedLendTrade = __encodeTrade({
            _tradeActionType: INotionalV3Router.TradeActionType.Lend,
            _marketIndex: INotionalV3Router.MarketIndex.SixMonths,
            _fCashAmount: lendUnits * F_CASH_UNIT,
            _minSlippage: 0
        });

        __lend({_currencyId: lendCurrencyId, _underlyingTokenAmount: lendAmount, _encodedLendTrade: encodedLendTrade});

        // 2. Run borrow test

        __successTest({
            _borrowCurrencyId: borrowCurrencyId,
            _borrowAsset: borrowAsset,
            _collateralCurrencyId: 0,
            _collateralAmount: 0
        });
    }

    function test_successWithBorrowedNativeAssetAndERC20Collateral() public {
        IERC20 collateralAsset = usdc;
        uint16 collateralCurrencyId = CURRENCY_ID_USDC;
        IERC20 borrowAsset = wethToken;
        uint16 borrowCurrencyId = CURRENCY_ID_ETH;

        uint256 collateralAssetAmount = assetUnit(collateralAsset) * 100_000;

        // Run borrow test, adding ERC20 collateral as part of the action

        __successTest({
            _borrowCurrencyId: borrowCurrencyId,
            _borrowAsset: borrowAsset,
            _collateralCurrencyId: collateralCurrencyId,
            _collateralAmount: collateralAssetAmount
        });
    }

    function __successTest(
        uint16 _borrowCurrencyId,
        IERC20 _borrowAsset,
        uint16 _collateralCurrencyId,
        uint256 _collateralAmount
    ) private {
        // Borrow a relatively small amount for the collateral posted
        // TODO: could do via the value interpreter
        uint256 borrowUnits = 3;
        uint256 fCashBorrowAmount = borrowUnits * F_CASH_UNIT;
        INotionalV3Router.MarketIndex borrowMarketIndex = INotionalV3Router.MarketIndex.ThreeMonths;

        bytes32 encodedBorrowTrade = __encodeTrade({
            _tradeActionType: INotionalV3Router.TradeActionType.Borrow,
            _marketIndex: borrowMarketIndex,
            _fCashAmount: fCashBorrowAmount,
            _minSlippage: 0
        });

        uint256 preTxVaultBorrowAssetBal = _borrowAsset.balanceOf(address(vaultProxy));

        vm.recordLogs();

        __borrow({
            _borrowCurrencyId: _borrowCurrencyId,
            _encodedBorrowTrade: encodedBorrowTrade,
            _collateralCurrencyId: _collateralCurrencyId,
            _collateralAssetAmount: _collateralAmount
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: toArray(address(_borrowAsset))
        });

        // Assert the expected Notional account portfolio state
        INotionalV3Router.PortfolioAsset[] memory portfolioAssets =
            notionalV3Router.getAccountPortfolio(address(notionalV3Position));
        // Need to search for unknown index of borrow asset
        bool borrowPortfolioAssetIncluded;
        for (uint256 i; i < portfolioAssets.length; i++) {
            INotionalV3Router.PortfolioAsset memory portfolioAsset = portfolioAssets[i];
            if (
                portfolioAsset.currencyId == uint256(_borrowCurrencyId)
                    && portfolioAsset.maturity
                        == __getMarketMaturity({_currencyId: _borrowCurrencyId, _marketIndex: borrowMarketIndex})
                    && portfolioAsset.notional == -int256(fCashBorrowAmount)
            ) {
                borrowPortfolioAssetIncluded = true;
                break;
            }
        }
        assertTrue(borrowPortfolioAssetIncluded);

        // Assert the borrowed asset is in the vault
        // TODO: assert more accurately
        assertTrue(_borrowAsset.balanceOf(address(vaultProxy)) > preTxVaultBorrowAssetBal);
    }
}

contract RedeemTest is TestBase {
    function test_successWithERC20() public {
        __successTest({_currencyId: CURRENCY_ID_USDC, _underlyingAsset: usdc});
    }

    function test_successWithNativeAsset() public {
        __successTest({_currencyId: CURRENCY_ID_ETH, _underlyingAsset: wethToken});
    }

    function __successTest(uint16 _currencyId, IERC20 _underlyingAsset) private {
        INotionalV3Router.MarketIndex marketIndex = INotionalV3Router.MarketIndex.ThreeMonths;

        // 1. Lend to create fCash position

        uint256 lendUnits = 11;
        uint256 lendAmount = lendUnits * assetUnit(_underlyingAsset);
        uint256 fCashAmount = lendUnits * F_CASH_UNIT;

        bytes32 encodedTrade = __encodeTrade({
            _tradeActionType: INotionalV3Router.TradeActionType.Lend,
            _marketIndex: marketIndex,
            _fCashAmount: fCashAmount,
            _minSlippage: 0
        });

        __lend({_currencyId: _currencyId, _underlyingTokenAmount: lendAmount, _encodedLendTrade: encodedTrade});

        // 2. Warp to maturity and settle the EP's account

        uint256 maturity = __getMarketMaturity({_currencyId: _currencyId, _marketIndex: marketIndex});
        vm.warp(maturity + 1);

        // TODO: WHY ISN'T THIS PART OF CONTRACT LOGIC?
        __settleAllMarkets();

        // 3. Redeem the fCash for its underlying

        // The redeemable account balance will be in terms of the "cash" token, i.e., a cToken
        (int256 cashBalance,,) =
            notionalV3Router.getAccountBalance({_currencyId: _currencyId, _account: address(notionalV3Position)});

        uint256 preTxVaultUnderlyingBal = _underlyingAsset.balanceOf(address(vaultProxy));

        vm.recordLogs();

        __redeem({_currencyId: _currencyId, _yieldTokenAmount: uint88(uint256(cashBalance))});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: toArray(address(_underlyingAsset))
        });

        uint256 postTxVaultUnderlyingBal = _underlyingAsset.balanceOf(address(vaultProxy));

        // Assert the underlying amount received
        uint256 underlyingAmountReceived = postTxVaultUnderlyingBal - preTxVaultUnderlyingBal;
        uint256 underlyingAmountExpected =
            __convertFCashToUnderlying({_fCashAmount: fCashAmount, _underlyingAsset: _underlyingAsset});
        assertTrue(underlyingAmountExpected > 0);
        // Needs some tolerance for yieldToken amount conversion
        uint256 underlyingAmountTolerance = WEI_ONE_PERCENT / 100; // 0.01% deviation tolerance
        assertApproxEqRel(underlyingAmountReceived, underlyingAmountExpected, underlyingAmountTolerance);
    }
}

////////////////////
// POSITION VALUE //
////////////////////

// contract PositionValueTest is TestBase {
//     // Components of asset value:
//     // - account balance (positive; collateral and matured+settled positive fCash)
//     // - account balance (negative; matured+settled negative fCash)
//     // - portfolio asset (positive fCash; non-mature lend)
//     // - portfolio asset (negative fCash; non-mature borrow)
//     // "account balances" are in terms of the corresponding cToken ("cash token")
//     // "portfolio assets" are in fCash, but are converted to their underlying via notionalV3Router.getPresentfCashValue()
//     // This setup will allow both WETH and ERC20 to be tested as both account balance and portfolio asset:
//     // 1. collateral: ERC20 (account balance)
//     // 2. lend: ERC20 (portfolio asset)
//     // 3. borrow1: WETH (mature, will convert to account balance when settled)
//     // 4. borrow2: WETH (immature, will remain as portfolio asset)

//     // Define a bunch of vars as storage to avoid stack-too-deep

//     INotionalV3Router.MarketIndex internal immatureLendMarketIndex;
//     INotionalV3Router.MarketIndex internal immatureBorrowMarketIndex = INotionalV3Router.MarketIndex.SixMonths;
//     INotionalV3Router.MarketIndex internal matureBorrowMarketIndex = INotionalV3Router.MarketIndex.ThreeMonths;

//     IERC20 internal collateralAsset;
//     uint16 internal collateralCurrencyId;
//     address internal collateralAssetCashTokenAddress;
//     uint256 internal collateralUnits;

//     IERC20 internal lendAsset;
//     uint16 internal lendCurrencyId;
//     uint256 internal lendUnits;

//     IERC20 internal borrowAsset;
//     uint16 internal borrowCurrencyId;
//     address internal borrowAssetCashTokenAddress;
//     uint256 internal borrowUnits;

//     uint256 internal collateralAssetAmount;
//     uint256 internal lendAssetAmount;
//     uint256 internal borrowAssetAmount;

//     function test_success() public {
//         // Immature markets (lend + immature borrow) must be further from maturity than the mature borrow
//         immatureLendMarketIndex = INotionalV3Router.MarketIndex.SixMonths;
//         immatureBorrowMarketIndex = INotionalV3Router.MarketIndex.SixMonths;
//         matureBorrowMarketIndex = INotionalV3Router.MarketIndex.ThreeMonths;

//         collateralAsset = usdc;
//         collateralCurrencyId = CURRENCY_ID_USDC;
//         collateralAssetCashTokenAddress = USDC_CASH_TOKEN_ADDRESS;
//         collateralUnits = 100_000;
//         collateralAssetAmount = collateralUnits * assetUnit(collateralAsset);

//         lendAsset = dai;
//         lendCurrencyId = CURRENCY_ID_DAI;
//         lendUnits = 300_000;
//         lendAssetAmount = lendUnits * assetUnit(lendAsset);

//         borrowAsset = wethToken;
//         borrowCurrencyId = CURRENCY_ID_ETH;
//         borrowAssetCashTokenAddress = ETH_CASH_TOKEN_ADDRESS;
//         borrowUnits = 3;
//         borrowAssetAmount = borrowUnits * assetUnit(borrowAsset);

//         // Add collateral

//         __addCollateral({_currencyId: collateralCurrencyId, _collateralAssetAmount: collateralAssetAmount});

//         // Add fCash position via lending

//         bytes32 encodedLendTrade = __encodeTrade({
//             _tradeActionType: INotionalV3Router.TradeActionType.Lend,
//             _marketIndex: immatureLendMarketIndex,
//             _fCashAmount: lendUnits * F_CASH_UNIT,
//             _minSlippage: 0
//         });

//         __lend({
//             _currencyId: lendCurrencyId,
//             _underlyingTokenAmount: lendAssetAmount,
//             _encodedLendTrade: encodedLendTrade
//         });

//         // Add two borrow positions of same asset and amount with different maturities

//         bytes32 encodedImmatureBorrowTrade = __encodeTrade({
//             _tradeActionType: INotionalV3Router.TradeActionType.Borrow,
//             _marketIndex: immatureBorrowMarketIndex,
//             _fCashAmount: borrowUnits * F_CASH_UNIT,
//             _minSlippage: 0
//         });

//         bytes32 encodedMatureBorrowTrade = __encodeTrade({
//             _tradeActionType: INotionalV3Router.TradeActionType.Borrow,
//             _marketIndex: matureBorrowMarketIndex,
//             _fCashAmount: borrowUnits * F_CASH_UNIT,
//             _minSlippage: 0
//         });

//         __borrow({
//             _borrowCurrencyId: borrowCurrencyId,
//             _encodedBorrowTrade: encodedImmatureBorrowTrade,
//             _collateralCurrencyId: 0,
//             _collateralAssetAmount: 0
//         });

//         __borrow({
//             _borrowCurrencyId: borrowCurrencyId,
//             _encodedBorrowTrade: encodedMatureBorrowTrade,
//             _collateralCurrencyId: 0,
//             _collateralAssetAmount: 0
//         });

//         // TODO: add more commentary and clear assertions below

//         // Warp to maturity and settle the EP's account
//         vm.warp(__getMarketMaturity({_currencyId: borrowCurrencyId, _marketIndex: matureBorrowMarketIndex}) + 1);
//         __settleAllMarkets();

//         (address[] memory managedAssets, uint256[] memory managedAssetAmounts) = notionalV3Position.getManagedAssets();
//         assertEq(managedAssets.length, 2);

//         assertEq(managedAssets[0], address(lendAsset));
//         // Value should be within a reasonable range of the underlying, e.g., here using 5%
//         assertApproxEqRel(managedAssetAmounts[0], lendAssetAmount, WEI_ONE_PERCENT * 5);
//         assertEq(managedAssets[1], collateralAssetCashTokenAddress);
//         // TODO: convert the cToken balance to the collateral asset and test that
//         // assertEq(managedAssetAmounts[1], );

//         (address[] memory debtAssets, uint256[] memory debtAssetAmounts) = notionalV3Position.getDebtAssets();
//         assertEq(managedAssets.length, 2);
//         assertEq(debtAssets[0], address(borrowAsset));
//         // Value should be within a reasonable range of the underlying, e.g., here using 5%
//         assertApproxEqRel(debtAssetAmounts[0], borrowAssetAmount, WEI_ONE_PERCENT * 5);
//         assertEq(debtAssets[1], borrowAssetCashTokenAddress);
//         // TODO: convert the cToken balance to the borrow asset and test that
//         // assertEq(debtAssetAmounts[1], );
//     }
// }

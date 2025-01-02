// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {
    IMorpho,
    MarketParams as MorphoLibMarketParams,
    MorphoBalancesLib
} from "morpho-blue/periphery/MorphoBalancesLib.sol";
import {IMorphoBluePosition as IMorphoBluePositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/morpho-blue/IMorphoBluePosition.sol";
import {IUintListRegistry as IUintListRegistryProd} from "contracts/persistent/uint-list-registry/IUintListRegistry.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IMorphoBlue} from "tests/interfaces/external/IMorphoBlue.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IMorphoBluePositionLib} from "tests/interfaces/internal/IMorphoBluePositionLib.sol";
import {IMorphoBluePositionParser} from "tests/interfaces/internal/IMorphoBluePositionParser.sol";

// ETHEREUM MAINNET CONSTANTS
address constant ETHEREUM_MORPHO_BLUE = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
bytes32 constant ETHEREUM_MORPHO_USDC_WETH_MARKET = 0x7dde86a1e94561d9690ec678db673c1a6396365f7d1d65e129c5fff0990ff758;

// BASE MAINNET CONSTANTS
address constant BASE_MORPHO_BLUE = ETHEREUM_MORPHO_BLUE;
bytes32 constant BASE_MORPHO_USDC_WETH_MARKET = 0x8793cf302b8ffd655ab97bd1c695dbd967807e8367a65cb2f4edaf1380ba1bda;

abstract contract MorphoBlueTestBase is IntegrationTest {
    event MarketIdAdded(bytes32 indexed marketId);

    event MarketIdRemoved(bytes32 indexed marketId);

    uint256 internal allowedMorphoBlueVaultsListId;
    uint256 internal morphoBlueTypeId;
    IMorphoBluePositionLib internal morphoBluePositionLib;
    IMorphoBluePositionParser internal morphoBluePositionParser;
    IMorphoBluePositionLib internal morphoBlueExternalPosition;

    IERC20 internal loanToken;
    IERC20 internal collateralToken;
    bytes32 internal marketId;
    IMorphoBlue internal morphoBlue;
    IMorphoBlue.MarketParams internal marketParams;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal listOwner;
    address internal vaultProxyAddress;
    IExternalPositionManager internal externalPositionManager;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        address _morphoBlueAddress,
        bytes32 _morphoBlueMarketId,
        uint256 _chainId
    ) internal {
        version = _version;

        setUpNetworkEnvironment({_chainId: _chainId});

        listOwner = makeAddr("AllowedMorphoBlueVaultsListOwner");
        marketId = _morphoBlueMarketId;

        // Create a new UintListRegistry list for allowed morpho blue vaults
        allowedMorphoBlueVaultsListId = core.persistent.uintListRegistry.createList({
            _owner: listOwner,
            _updateType: formatUintListRegistryUpdateType(IUintListRegistryProd.UpdateType.AddAndRemove),
            _initialItems: toArray(uint256(marketId))
        });

        externalPositionManager = IExternalPositionManager(getExternalPositionManagerAddressForVersion(version));
        (morphoBluePositionLib, morphoBluePositionParser, morphoBlueTypeId) = deployMorphoBlue({
            _allowedMorphoBlueVaultsListId: allowedMorphoBlueVaultsListId,
            _morphoBlueAddress: _morphoBlueAddress,
            _uintListRegistryAddress: address(core.persistent.uintListRegistry)
        });

        morphoBlue = IMorphoBlue(_morphoBlueAddress);
        marketParams = morphoBlue.idToMarketParams(_morphoBlueMarketId);
        loanToken = IERC20(marketParams.loanToken);
        collateralToken = IERC20(marketParams.collateralToken);

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        vm.prank(fundOwner);
        morphoBlueExternalPosition = IMorphoBluePositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: morphoBlueTypeId,
                _initializationData: ""
            })
        );

        // Add the loanToken and collateralToken to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(loanToken),
            _skipIfRegistered: true
        });
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(collateralToken),
            _skipIfRegistered: true
        });

        // Increase the loanToken and collateralToken balances
        increaseTokenBalance({_token: loanToken, _to: vaultProxyAddress, _amount: assetUnit(loanToken) * 678});
        increaseTokenBalance({
            _token: collateralToken,
            _to: vaultProxyAddress,
            _amount: assetUnit(collateralToken) * 345
        });

        // Supply some loanToken to the MorphoMarket so that assets can be borrowed
        address morphoLender = makeAddr("MorphoLender");
        uint256 morphoLenderLoanTokenBalance = assetUnit(loanToken) * 10_000;
        increaseTokenBalance({_to: morphoLender, _token: loanToken, _amount: morphoLenderLoanTokenBalance});
        vm.startPrank(morphoLender);
        loanToken.approve(address(morphoBlue), type(uint256).max);
        morphoBlue.supply({
            _marketParams: marketParams,
            _assets: morphoLenderLoanTokenBalance,
            _shares: 0,
            _onBehalf: morphoLender,
            _data: ""
        });
        vm.stopPrank();
    }

    // DEPLOYMENT HELPERS

    function deployMorphoBlue(
        uint256 _allowedMorphoBlueVaultsListId,
        address _morphoBlueAddress,
        address _uintListRegistryAddress
    )
        public
        returns (
            IMorphoBluePositionLib morphoBluePositionLib_,
            IMorphoBluePositionParser morphoBluePositionParser_,
            uint256 typeId_
        )
    {
        morphoBluePositionLib_ = deployMorphoBluePositionLib({
            _allowedMorphoBlueVaultsListId: _allowedMorphoBlueVaultsListId,
            _morphoBlueAddress: _morphoBlueAddress,
            _uintListRegistryAddress: _uintListRegistryAddress
        });
        morphoBluePositionParser_ = deployMorphoBluePositionParser({_morphoBlueAddress: _morphoBlueAddress});

        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "MORPHO_BLUE",
            _lib: address(morphoBluePositionLib_),
            _parser: address(morphoBluePositionParser_)
        });

        return (morphoBluePositionLib_, morphoBluePositionParser_, typeId_);
    }

    function deployMorphoBluePositionLib(
        uint256 _allowedMorphoBlueVaultsListId,
        address _morphoBlueAddress,
        address _uintListRegistryAddress
    ) public returns (IMorphoBluePositionLib) {
        bytes memory args = abi.encode(_allowedMorphoBlueVaultsListId, _morphoBlueAddress, _uintListRegistryAddress);
        address addr = deployCode("MorphoBluePositionLib.sol", args);
        return IMorphoBluePositionLib(addr);
    }

    function deployMorphoBluePositionParser(address _morphoBlueAddress) public returns (IMorphoBluePositionParser) {
        bytes memory args = abi.encode(_morphoBlueAddress);
        address addr = deployCode("MorphoBluePositionParser.sol", args);
        return IMorphoBluePositionParser(addr);
    }

    // ACTION HELPERS

    function __lend(bytes32 _marketId, uint256 _assetAmount) private {
        bytes memory actionArgs = abi.encode(_marketId, _assetAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(morphoBlueExternalPosition),
            _actionId: uint256(IMorphoBluePositionProd.Actions.Lend),
            _actionArgs: actionArgs
        });
    }

    function __redeem(bytes32 _marketId, uint256 _sharesAmount) private {
        bytes memory actionArgs = abi.encode(_marketId, _sharesAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(morphoBlueExternalPosition),
            _actionId: uint256(IMorphoBluePositionProd.Actions.Redeem),
            _actionArgs: actionArgs
        });
    }

    function __addCollateral(bytes32 _marketId, uint256 _collateralAmount) private {
        bytes memory actionArgs = abi.encode(_marketId, _collateralAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(morphoBlueExternalPosition),
            _actionId: uint256(IMorphoBluePositionProd.Actions.AddCollateral),
            _actionArgs: actionArgs
        });
    }

    function __removeCollateral(bytes32 _marketId, uint256 _collateralAmount) private {
        bytes memory actionArgs = abi.encode(_marketId, _collateralAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(morphoBlueExternalPosition),
            _actionId: uint256(IMorphoBluePositionProd.Actions.RemoveCollateral),
            _actionArgs: actionArgs
        });
    }

    function __borrow(bytes32 _marketId, uint256 _borrowAmount) private {
        bytes memory actionArgs = abi.encode(_marketId, _borrowAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(morphoBlueExternalPosition),
            _actionId: uint256(IMorphoBluePositionProd.Actions.Borrow),
            _actionArgs: actionArgs
        });
    }

    function __repay(bytes32 _marketId, uint256 _repayAmount) private {
        bytes memory actionArgs = abi.encode(_marketId, _repayAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(morphoBlueExternalPosition),
            _actionId: uint256(IMorphoBluePositionProd.Actions.Repay),
            _actionArgs: actionArgs
        });
    }

    function __getBorrowableAmountFromCollateral(uint256 _collateralAmount) private returns (uint256 borrowAmount_) {
        // Get collateralAmount value in terms of borrowAmount
        uint256 borrowAssetValue = core.release.valueInterpreter.calcCanonicalAssetValue({
            _baseAsset: address(collateralToken),
            _amount: _collateralAmount,
            _quoteAsset: address(loanToken)
        });

        // Return a borrowAmount equivalent to a fraction of the collateralAmount value
        return borrowAssetValue / 100;
    }

    // TESTS

    function test_lend_success() public {
        vm.recordLogs();

        // Assert that the event has been emitted
        expectEmit(address(morphoBlueExternalPosition));
        emit MarketIdAdded(marketId);

        uint256 assetAmount = loanToken.balanceOf(vaultProxyAddress) / 3;

        __lend({_marketId: marketId, _assetAmount: assetAmount});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        // Assert that the marketId has been added to the external position
        assertEq(bytes32(marketId), morphoBlueExternalPosition.getMarketIds()[0]);

        // Assert that the supplied value is accounted for in the EP
        (address[] memory preAccrualAssets, uint256[] memory preAccrualAmounts) =
            morphoBlueExternalPosition.getManagedAssets();

        assertEq(preAccrualAssets, toArray(address(loanToken)), "Incorrect managed assets");
        assertApproxEqAbs(preAccrualAmounts[0], assetAmount, 1, "Incorrect managed asset amounts");

        // Elapse time for interest to accrue
        skip(30 days);

        // Assert that the supplied value has accrued interest
        (address[] memory postAccrualAssets, uint256[] memory postAccrualAmounts) =
            morphoBlueExternalPosition.getManagedAssets();

        // Accrue interest so that the getters reflect that increased value
        morphoBlue.accrueInterest({_marketParams: morphoBlue.idToMarketParams(marketId)});
        IMorphoBlue.Market memory market = morphoBlue.market({_id: marketId});
        uint256 postAccrualSuppliedValue = morphoBlue.position({
            _id: marketId,
            _user: address(morphoBlueExternalPosition)
        }).supplyShares * market.totalSupplyAssets / market.totalSupplyShares;

        assertGt(postAccrualSuppliedValue, assetAmount, "Interest not accrued");

        assertEq(postAccrualAssets, toArray(address(loanToken)), "Incorrect managed assets");
        assertApproxEqAbs(postAccrualAmounts[0], postAccrualSuppliedValue, 1, "Incorrect managed asset amounts");
    }

    // Test that the function reverts if the morpho blue market is unsupported
    function test_lend_unsupportedMarket() public {
        vm.prank(listOwner);

        // Remove the market from the list of allowed markets
        core.persistent.uintListRegistry.removeFromList({
            _id: allowedMorphoBlueVaultsListId,
            _items: toArray(uint256(marketId))
        });

        vm.expectRevert(IMorphoBluePositionLib.DisallowedMarket.selector);

        __lend({_marketId: marketId, _assetAmount: 123});
    }

    function __test_redeem_success(bool _redeemAll) private {
        uint256 lentAssetAmount = loanToken.balanceOf(vaultProxyAddress) / 7;

        __lend({_marketId: marketId, _assetAmount: lentAssetAmount});

        vm.recordLogs();
        IMorphoBlue.Position memory position =
            morphoBlue.position({_id: marketId, _user: address(morphoBlueExternalPosition)});

        uint256 redeemedSharesAmount = _redeemAll ? position.supplyShares : position.supplyShares / 3;

        if (_redeemAll) {
            vm.expectEmit(address(morphoBlueExternalPosition));
            emit MarketIdRemoved(marketId);
        }

        uint256 preRedeemVaultAssetBalance = loanToken.balanceOf(vaultProxyAddress);

        __redeem({_marketId: marketId, _sharesAmount: redeemedSharesAmount});

        uint256 postRedeemVaultAssetBalance = loanToken.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(loanToken))
        });

        if (_redeemAll) {
            // Assert that the market has been removed from the external position
            assertEq(morphoBlueExternalPosition.getMarketIds().length, 0, "Incorrect marketIds length");
        } else {
            // Assert that the marketId has not been removed from the external position
            assertEq(1, morphoBlueExternalPosition.getMarketIds().length, "Incorrect marketIds length");
            assertEq(bytes32(marketId), morphoBlueExternalPosition.getMarketIds()[0], "Incorrect marketId");
        }

        uint256 vaultProxyAssetBalanceDelta = postRedeemVaultAssetBalance - preRedeemVaultAssetBalance;

        // Assert that the supplied value is accounted for in the EP
        (address[] memory assets, uint256[] memory amounts) = morphoBlueExternalPosition.getManagedAssets();
        if (_redeemAll) {
            assertEq(assets, new address[](0), "Incorrect managed assets");
            assertEq(amounts, new uint256[](0), "Incorrect managed asset amounts");
        } else {
            assertEq(assets, toArray(address(loanToken)), "Incorrect managed assets");
            assertApproxEqAbs(
                amounts[0], lentAssetAmount - vaultProxyAssetBalanceDelta, 1, "Incorrect managed asset amounts"
            );
        }
    }

    function test_redeem_successPartial() public {
        __test_redeem_success({_redeemAll: false});
    }

    function test_redeem_successFull() public {
        __test_redeem_success({_redeemAll: true});
    }

    function test_addCollateral_success() public {
        vm.recordLogs();

        // Assert that the event has been emitted
        expectEmit(address(morphoBlueExternalPosition));
        emit MarketIdAdded(marketId);

        uint256 addedCollateral = collateralToken.balanceOf(vaultProxyAddress) / 7;

        __addCollateral({_marketId: marketId, _collateralAmount: addedCollateral});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        // Assert that the marketId has been added to the external position
        assertEq(bytes32(marketId), morphoBlueExternalPosition.getMarketIds()[0]);

        // Assert that the supplied value is accounted for in the EP
        (address[] memory assets, uint256[] memory amounts) = morphoBlueExternalPosition.getManagedAssets();

        assertEq(assets, toArray(address(collateralToken)), "Incorrect managed assets");
        assertEq(amounts, toArray(addedCollateral), "Incorrect managed asset amounts");
    }

    function __test_removeCollateral(bool _removeAll) private {
        uint256 addedCollateral = collateralToken.balanceOf(vaultProxyAddress) / 7;

        __addCollateral({_marketId: marketId, _collateralAmount: addedCollateral});

        vm.recordLogs();
        uint256 removedCollateral = _removeAll ? addedCollateral : addedCollateral / 3;

        if (_removeAll) {
            expectEmit(address(morphoBlueExternalPosition));
            emit MarketIdRemoved(marketId);
        }

        uint256 preRemoveVaultCollateralBalance = collateralToken.balanceOf(vaultProxyAddress);

        __removeCollateral({_marketId: marketId, _collateralAmount: removedCollateral});

        uint256 postRemoveVaultCollateralBalance = collateralToken.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(collateralToken))
        });

        if (_removeAll) {
            // Assert that the market has been removed from the external position
            assertEq(morphoBlueExternalPosition.getMarketIds().length, 0, "Incorrect marketIds length");
        } else {
            // Assert that the marketId has not been removed from the external position
            assertEq(1, morphoBlueExternalPosition.getMarketIds().length, "Incorrect marketIds length");
            assertEq(bytes32(marketId), morphoBlueExternalPosition.getMarketIds()[0], "Incorrect marketId");
        }

        // Assert that the supplied value is accounted for in the EP
        (address[] memory assets, uint256[] memory amounts) = morphoBlueExternalPosition.getManagedAssets();
        if (_removeAll) {
            assertEq(assets, new address[](0), "Incorrect managed assets");
            assertEq(amounts, new uint256[](0), "Incorrect managed asset amounts");
        } else {
            assertEq(assets, toArray(address(collateralToken)), "Incorrect managed assets");
            assertEq(amounts, toArray(addedCollateral - removedCollateral), "Incorrect managed asset amounts");
        }

        assertEq(
            postRemoveVaultCollateralBalance - preRemoveVaultCollateralBalance,
            removedCollateral,
            "Incorrect vaultProxyAssetBalanceDelta"
        );
    }

    function test_removeCollateral_successFull() public {
        __test_removeCollateral({_removeAll: true});
    }

    function test_removeCollateral_successPartial() public {
        __test_removeCollateral({_removeAll: false});
    }

    function test_borrow_success() public {
        uint256 addedCollateral = collateralToken.balanceOf(vaultProxyAddress) / 3;

        __addCollateral({_marketId: marketId, _collateralAmount: addedCollateral});

        uint256 borrowedAmount = __getBorrowableAmountFromCollateral({_collateralAmount: addedCollateral});

        vm.recordLogs();

        uint256 preBorrowVaultAssetBalance = loanToken.balanceOf(vaultProxyAddress);

        __borrow({_marketId: marketId, _borrowAmount: borrowedAmount});

        uint256 borrowAssetBalanceDelta = loanToken.balanceOf(vaultProxyAddress) - preBorrowVaultAssetBalance;

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(loanToken))
        });

        // Assert that the vaultProxy borrow asset balance has increased by the borrowed amount
        assertEq(borrowAssetBalanceDelta, borrowedAmount, "Incorrect borrow asset balance delta");

        // Assert that the collateral and borrowed values are accounted for in the EP
        (address[] memory debtAssets, uint256[] memory debtAmounts) = morphoBlueExternalPosition.getDebtAssets();
        (address[] memory managedAssets, uint256[] memory managedAmounts) =
            morphoBlueExternalPosition.getManagedAssets();

        assertEq(debtAssets, toArray(address(loanToken)), "Incorrect debt assets");
        // 1 wei of tolerance for rounding
        assertApproxEqAbs(debtAmounts[0], borrowedAmount, 1, "Incorrect debt amounts");

        assertEq(managedAssets, toArray(address(collateralToken)), "Incorrect managed assets");
        assertEq(managedAmounts, toArray(addedCollateral), "Incorrect managed asset amounts");
    }

    function __test_repay(bool _repayAll) private {
        uint256 addedCollateral = collateralToken.balanceOf(vaultProxyAddress) / 3;

        __addCollateral({_marketId: marketId, _collateralAmount: addedCollateral});

        uint256 borrowedAmount = __getBorrowableAmountFromCollateral({_collateralAmount: addedCollateral});

        __borrow({_marketId: marketId, _borrowAmount: borrowedAmount});

        uint256 repayAmount = _repayAll ? type(uint256).max : borrowedAmount / 3;

        // Elapse 1 week for interest to accrue
        skip(7 days);

        // The asset delta should correspond to the value of the shares remaining in the position
        uint256 borrowedSharesAssetValue = MorphoBalancesLib.expectedBorrowAssets({
            morpho: IMorpho(address(morphoBlue)),
            marketParams: MorphoLibMarketParams({
                loanToken: marketParams.loanToken,
                collateralToken: marketParams.collateralToken,
                oracle: marketParams.oracle,
                irm: marketParams.irm,
                lltv: marketParams.lltv
            }),
            user: address(morphoBlueExternalPosition)
        });

        vm.recordLogs();

        uint256 preRepayVaultAssetBalance = loanToken.balanceOf(vaultProxyAddress);

        __repay({_marketId: marketId, _repayAmount: repayAmount});

        uint256 borrowAssetBalanceDelta = preRepayVaultAssetBalance - loanToken.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        // Assert that the vaultProxy borrow asset balance has decreased by the repaid amount
        // 1 wei tolerance for rounding
        assertApproxEqAbs(
            borrowAssetBalanceDelta,
            _repayAll ? borrowedSharesAssetValue : repayAmount,
            1,
            "Incorrect borrow asset balance delta"
        );

        // Assert that the collateral and borrowed values are accounted for in the EP
        (address[] memory debtAssets, uint256[] memory debtAmounts) = morphoBlueExternalPosition.getDebtAssets();
        (address[] memory managedAssets, uint256[] memory managedAmounts) =
            morphoBlueExternalPosition.getManagedAssets();

        if (_repayAll) {
            assertEq(debtAssets, new address[](0), "Incorrect debt assets");
            assertEq(debtAmounts, new uint256[](0), "Incorrect debt amounts");
        } else {
            assertEq(debtAssets, toArray(address(loanToken)), "Incorrect debt assets");
            assertApproxEqAbs(debtAmounts[0], borrowedSharesAssetValue - repayAmount, 1, "Incorrect debt amounts");
        }

        assertEq(managedAssets, toArray(address(collateralToken)), "Incorrect managed assets");
        assertEq(managedAmounts, toArray(addedCollateral), "Incorrect managed asset amounts");

        if (_repayAll) {
            // Remove all collateral and ensure that MarketId is removed
            vm.recordLogs();

            expectEmit(address(morphoBlueExternalPosition));
            emit MarketIdRemoved(marketId);

            __removeCollateral({_marketId: marketId, _collateralAmount: addedCollateral});
        }
    }

    function test_repay_successFull() public {
        __test_repay({_repayAll: true});
    }

    function test_repay_successPartial() public {
        __test_repay({_repayAll: false});
    }
}

contract MorphoBlueUsdcWethTestEthereum is MorphoBlueTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _morphoBlueAddress: ETHEREUM_MORPHO_BLUE,
            _morphoBlueMarketId: ETHEREUM_MORPHO_USDC_WETH_MARKET,
            _chainId: ETHEREUM_CHAIN_ID
        });
    }
}

contract MorphoBlueUsdcWethTestEthereumV4 is MorphoBlueTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _morphoBlueAddress: ETHEREUM_MORPHO_BLUE,
            _morphoBlueMarketId: ETHEREUM_MORPHO_USDC_WETH_MARKET,
            _chainId: ETHEREUM_CHAIN_ID
        });
    }
}

contract MorphoBlueUsdcWethTestBaseChain is MorphoBlueTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _morphoBlueAddress: BASE_MORPHO_BLUE,
            _morphoBlueMarketId: BASE_MORPHO_USDC_WETH_MARKET,
            _chainId: BASE_CHAIN_ID
        });
    }
}

contract MorphoBlueUsdcWethTestBaseChainV4 is MorphoBlueTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _morphoBlueAddress: BASE_MORPHO_BLUE,
            _morphoBlueMarketId: BASE_MORPHO_USDC_WETH_MARKET,
            _chainId: BASE_CHAIN_ID
        });
    }
}

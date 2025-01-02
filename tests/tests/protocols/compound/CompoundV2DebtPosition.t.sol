// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ICompoundDebtPosition as ICompoundDebtPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/compound-debt/ICompoundDebtPosition.sol";

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ICompoundV2CERC20} from "tests/interfaces/external/ICompoundV2CERC20.sol";
import {ICompoundV2CEther} from "tests/interfaces/external/ICompoundV2CEther.sol";
import {ICompoundV2Comptroller} from "tests/interfaces/external/ICompoundV2Comptroller.sol";
import {ICompoundDebtPositionLib} from "tests/interfaces/internal/ICompoundDebtPositionLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {ICompoundPriceFeed} from "tests/interfaces/internal/ICompoundPriceFeed.sol";
import {ETHEREUM_COMPTROLLER} from "./CompoundV2Constants.sol";

abstract contract TestBase is IntegrationTest {
    event AssetBorrowed(address indexed asset, uint256 amount);
    event BorrowedAssetRepaid(address indexed asset, uint256 amount);
    event CollateralAssetAdded(address indexed asset, uint256 amount);
    event CollateralAssetRemoved(address indexed asset, uint256 amount);

    address internal vaultOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    ICompoundDebtPositionLib internal compoundV2DebtPosition;
    ICompoundV2Comptroller internal compoundV2Comptroller;
    ICompoundV2CEther internal cETH;
    address internal compToken;
    ICompoundPriceFeed internal priceFeed;

    // Set by child contract
    EnzymeVersion internal version;

    function setUp() public virtual override {
        (comptrollerProxyAddress, vaultProxyAddress, vaultOwner) = createTradingFundForVersion(version);

        // Deploy all CompoundV2Debt dependencies
        (uint256 typeId, address _priceFeed) = __deployPositionType({
            _externalPositionManagerAddress: getExternalPositionManagerAddressForVersion(version),
            _wethToken: address(wethToken),
            _fundDeployerAddress: getFundDeployerAddressForVersion(version),
            _valueInterpreterAddress: getValueInterpreterAddressForVersion(version),
            _cETH: address(cETH),
            _compToken: compToken,
            _compoundV2Comptroller: compoundV2Comptroller
        });

        priceFeed = ICompoundPriceFeed(_priceFeed);

        // Create an empty CompoundV2Debt for the fund
        vm.prank(vaultOwner);
        compoundV2DebtPosition = ICompoundDebtPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS
    function __deployLib(ICompoundV2Comptroller _compoundV2Comptroller, address _compToken, address _weth)
        internal
        returns (address lib_)
    {
        bytes memory args = abi.encode(_compoundV2Comptroller, _compToken, _weth);

        return deployCode("CompoundDebtPositionLib.sol", args);
    }

    function __deployParser(address _compoundPriceFeed, address _compToken, address _valueInterpreterAddress)
        internal
        returns (address parser_)
    {
        bytes memory args = abi.encode(_compoundPriceFeed, _compToken, _valueInterpreterAddress);

        return deployCode("CompoundDebtPositionParser.sol", args);
    }

    function __deployCompoundV2PriceFeed(address _fundDeployerAddress, address _wethToken, address _cETH)
        internal
        returns (address priceFeed_)
    {
        bytes memory args = abi.encode(_fundDeployerAddress, _wethToken, _cETH);
        return deployCode("CompoundPriceFeed.sol", args);
    }

    function __deployPositionType(
        address _externalPositionManagerAddress,
        address _wethToken,
        address _fundDeployerAddress,
        address _valueInterpreterAddress,
        address _cETH,
        address _compToken,
        ICompoundV2Comptroller _compoundV2Comptroller
    ) internal returns (uint256 typeId_, address compoundV2PriceFeed_) {
        compoundV2PriceFeed_ = __deployCompoundV2PriceFeed({
            _fundDeployerAddress: _fundDeployerAddress,
            _wethToken: _wethToken,
            _cETH: _cETH
        });

        // Deploy CompoundV2 Debt type contracts
        address compoundV2DebtPositionLibAddress = address(
            __deployLib({_compoundV2Comptroller: _compoundV2Comptroller, _compToken: _compToken, _weth: _wethToken})
        );
        address compoundV2DebtPositionParser = address(
            __deployParser({
                _compoundPriceFeed: compoundV2PriceFeed_,
                _compToken: _compToken,
                _valueInterpreterAddress: _valueInterpreterAddress
            })
        );

        // Register CompoundV2Debt type
        typeId_ = registerExternalPositionType({
            _externalPositionManager: IExternalPositionManager(_externalPositionManagerAddress),
            _label: "COMPOUND_V2_DEBT",
            _lib: compoundV2DebtPositionLibAddress,
            _parser: compoundV2DebtPositionParser
        });

        return (typeId_, compoundV2PriceFeed_);
    }

    // ACTION HELPERS

    function __addCollateral(address[] memory _cTokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_cTokens, _amounts, "");

        vm.prank(vaultOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(compoundV2DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(ICompoundDebtPositionProd.ExternalPositionActions.AddCollateral)
        });
    }

    function __removeCollateral(address[] memory _cTokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_cTokens, _amounts, "");

        vm.prank(vaultOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(compoundV2DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(ICompoundDebtPositionProd.ExternalPositionActions.RemoveCollateral)
        });
    }

    function __borrowAssets(address[] memory _underlyings, uint256[] memory _amounts, address[] memory _cTokens)
        internal
    {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts, abi.encode(_cTokens));

        vm.prank(vaultOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(compoundV2DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(ICompoundDebtPositionProd.ExternalPositionActions.Borrow)
        });
    }

    function __repayBorrowedAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts, "");

        vm.prank(vaultOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(compoundV2DebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(ICompoundDebtPositionProd.ExternalPositionActions.RepayBorrow)
        });
    }

    function __claimComp() internal {
        vm.prank(vaultOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(compoundV2DebtPosition),
            _actionArgs: abi.encode(new address[](0), new uint256[](0), ""),
            _actionId: uint256(ICompoundDebtPositionProd.ExternalPositionActions.ClaimComp)
        });
    }

    // MISC HELPERS
    function __getCTokenUnderlying(ICompoundV2CERC20 _cToken) internal returns (address underlying_) {
        return address(_cToken) == address(cETH) ? address(wethToken) : _cToken.underlying();
    }

    function __registerCTokensAndUnderlyings(address[] memory _cTokens) internal {
        for (uint256 i = 0; i < _cTokens.length; i++) {
            if (version == EnzymeVersion.V4) {
                v4AddPrimitiveWithTestAggregator({
                    _tokenAddress: __getCTokenUnderlying(ICompoundV2CERC20(_cTokens[i])),
                    _skipIfRegistered: true
                });
            }

            // cETH is already registered in the CompoundPriceFeed constructor
            if (_cTokens[i] != address(cETH)) {
                vm.prank(IFundDeployer(getFundDeployerAddressForVersion(version)).getOwner());

                ICompoundPriceFeed(priceFeed).addCTokens(toArray(_cTokens[i]));
            }

            addDerivative({
                _valueInterpreter: core.release.valueInterpreter,
                _tokenAddress: _cTokens[i],
                _skipIfRegistered: true,
                _priceFeedAddress: address(priceFeed)
            });
        }
    }

    function __dealCTokenAndAddCollateral(address[] memory _cTokens, uint256[] memory _amounts) internal {
        for (uint256 i = 0; i < _cTokens.length; i++) {
            increaseTokenBalance({_token: IERC20(_cTokens[i]), _to: vaultProxyAddress, _amount: _amounts[i]});
        }

        __addCollateral({_cTokens: _cTokens, _amounts: _amounts});
    }
}

abstract contract AddCollateralTest is TestBase {
    function __test_addCollateral_success(address[] memory _cTokens, uint256[] memory _amounts) internal {
        // increase cToken balance for vault with amounts
        for (uint256 i = 0; i < _cTokens.length; i++) {
            increaseTokenBalance({_token: IERC20(_cTokens[i]), _to: vaultProxyAddress, _amount: _amounts[i]});
        }

        (address[] memory uniqueCTokens, uint256[] memory uniqueCTokensAmounts) =
            aggregateAssetAmounts({_rawAssets: _cTokens, _rawAmounts: _amounts, _ceilingAtMax: true});

        // expect emit add collateral event for every added cToken
        for (uint256 i = 0; i < uniqueCTokens.length; i++) {
            expectEmit(address(compoundV2DebtPosition));
            emit CollateralAssetAdded(_cTokens[i], _amounts[i]);
        }

        vm.recordLogs();

        __addCollateral({_cTokens: _cTokens, _amounts: _amounts});

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // check the external position storage saves cToken for the collateral assets
        for (uint256 i = 0; i < _cTokens.length; i++) {
            assertTrue(compoundV2DebtPosition.assetIsCollateral(_cTokens[i]), "Asset is not collateral");
        }

        (address[] memory managedAssets, uint256[] memory managedAmounts) = compoundV2DebtPosition.getManagedAssets();

        assertEq(managedAssets, uniqueCTokens, "Invalid managed assets");

        for (uint256 i = 0; i < managedAmounts.length; i++) {
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(managedAmounts[i], uniqueCTokensAmounts[i], 1, "Invalid managed amounts");
        }
    }

    function test_addCollateral_failsNotSupportedAssetAddCollateral() public {
        IERC20 fakeCToken = createTestToken("Fake CToken");

        uint256 amountToAddCollateral = 100;
        // increase token balance so it doesn't revert because of insufficient balance
        increaseTokenBalance({_token: fakeCToken, _to: vaultProxyAddress, _amount: amountToAddCollateral});

        vm.expectRevert(formatError("__addCollateralAssets: Error while calling enterMarkets on Compound"));

        __addCollateral({_cTokens: toArray(address(fakeCToken)), _amounts: toArray(amountToAddCollateral)});
    }
}

abstract contract RemoveCollateralTest is TestBase {
    function __test_removeCollateral_success(
        address[] memory _cTokens,
        uint256[] memory _amountsToAdd,
        uint256[] memory _amountsToRemove
    ) internal {
        __dealCTokenAndAddCollateral({_cTokens: _cTokens, _amounts: _amountsToAdd});

        (, uint256[] memory uniqueAmountsToAdd) =
            aggregateAssetAmounts({_rawAssets: _cTokens, _rawAmounts: _amountsToAdd, _ceilingAtMax: false});

        (address[] memory uniqueCTokensToRemove, uint256[] memory uniqueAmountsToRemove) =
            aggregateAssetAmounts({_rawAssets: _cTokens, _rawAmounts: _amountsToRemove, _ceilingAtMax: true});

        for (uint256 i = 0; i < _cTokens.length; i++) {
            // expect emit remove collateral event for every fully-removed underlying
            expectEmit(address(compoundV2DebtPosition));
            emit CollateralAssetRemoved(_cTokens[i], _amountsToRemove[i]);
        }

        vm.recordLogs();

        __removeCollateral({_cTokens: _cTokens, _amounts: _amountsToRemove});

        // Assert assetsToReceive was correctly formatted (removed collateral assets)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: _cTokens
        });

        for (uint256 i = 0; i < uniqueCTokensToRemove.length; i++) {
            // assert external position storage removes collateral asset for every fully-removed underlying
            // and check the external position balances are reflecting the removed collateral

            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                assertFalse(compoundV2DebtPosition.assetIsCollateral(uniqueCTokensToRemove[i]), "Asset is collateral");
                assertEq(
                    IERC20(uniqueCTokensToRemove[i]).balanceOf(address(compoundV2DebtPosition)),
                    0,
                    "CToken was not fully-withdrawn"
                );
            } else {
                // 1 wei difference is allowed because of the interest accrued
                assertApproxEqAbs(
                    IERC20(uniqueCTokensToRemove[i]).balanceOf(address(compoundV2DebtPosition)),
                    uniqueAmountsToAdd[i] - uniqueAmountsToRemove[i],
                    1,
                    "CToken was not partially-withdrawn in the expected amount"
                );
            }
        }
    }

    function test_removeCollateral_failsInvalidCollateralAsset() public {
        vm.expectRevert(formatError("__removeCollateralAssets: Asset is not collateral"));

        __removeCollateral({_cTokens: toArray(makeAddr("InvalidCollateralAsset")), _amounts: toArray(1)});
    }
}

abstract contract BorrowTest is TestBase {
    function __test_borrow_success(
        address[] memory _cTokensCollateral,
        uint256[] memory _cTokensCollateralAmounts,
        address[] memory _underlyingsToBorrow,
        uint256[] memory _underlyingsToBorrowAmounts
    ) internal {
        __dealCTokenAndAddCollateral({_cTokens: _cTokensCollateral, _amounts: _cTokensCollateralAmounts});

        (address[] memory uniqueTokensToBorrow, uint256[] memory uniqueTokensToBorrowAmounts) = aggregateAssetAmounts({
            _rawAssets: _underlyingsToBorrow,
            _rawAmounts: _underlyingsToBorrowAmounts,
            _ceilingAtMax: false
        });

        // expect the correct event for every borrowed underlying
        for (uint256 i = 0; i < _underlyingsToBorrow.length; i++) {
            expectEmit(address(compoundV2DebtPosition));
            emit AssetBorrowed(_underlyingsToBorrow[i], _underlyingsToBorrowAmounts[i]);
        }

        vm.recordLogs();

        __borrowAssets({
            _underlyings: _underlyingsToBorrow,
            _amounts: _underlyingsToBorrowAmounts,
            _cTokens: _cTokensCollateral
        });

        // Assert assetsToReceive was correctly formatted (borrowed assets)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: _underlyingsToBorrow
        });

        // assert external position storage saves cToken for the borrowed assets
        for (uint256 i = 0; i < uniqueTokensToBorrow.length; i++) {
            assertNotEq(
                compoundV2DebtPosition.getCTokenFromBorrowedAsset(uniqueTokensToBorrow[i]),
                address(0),
                "Asset is not borrowed"
            );
        }

        // Assert position value
        (address[] memory debtAssets, uint256[] memory debtAmounts) = compoundV2DebtPosition.getDebtAssets();

        // check the debt assets match the borrowed assets
        assertEq(debtAssets, uniqueTokensToBorrow, "Invalid debt assets");

        for (uint256 i = 0; i < debtAmounts.length; i++) {
            // debt can already accrue interest, that's why we allow a 1 wei difference
            assertApproxEqAbs(debtAmounts[i], uniqueTokensToBorrowAmounts[i], 1, "Invalid debt amount");
        }

        // check the borrowed assets vault balance
        for (uint256 i = 0; i < uniqueTokensToBorrow.length; i++) {
            assertEq(
                IERC20(uniqueTokensToBorrow[i]).balanceOf(vaultProxyAddress),
                uniqueTokensToBorrowAmounts[i],
                "Borrowed asset amount was not sent to the vault"
            );
        }
    }

    function test_borrow_failsNotSupportedAssetBorrow() public {
        vm.expectRevert("parseAssetsForAction: Unsupported asset");

        __borrowAssets({
            _underlyings: toArray(makeAddr("UnsupportedAsset")),
            _amounts: toArray(1),
            _cTokens: toArray(makeAddr("FakeCToken"))
        });
    }

    function __test_borrow_failsBadTokenCTokenPair(address _cToken) public {
        vm.expectRevert("parseAssetsForAction: Bad token cToken pair");

        __borrowAssets({_underlyings: toArray(address(wethToken)), _amounts: toArray(1), _cTokens: toArray(_cToken)});
    }

    function test_borrow_failsProblemWhileBorrowingFromCompound() public {
        __dealCTokenAndAddCollateral({
            _cTokens: toArray(address(cETH)),
            _amounts: toArray(10 * assetUnit(IERC20(address(cETH))))
        });

        uint256 amountToBorrow = 8 * assetUnit(wethToken);

        vm.expectRevert(formatError("__borrowAssets: Problem while borrowing from Compound"));

        __borrowAssets({
            _underlyings: toArray(address(wethToken)),
            _amounts: toArray(amountToBorrow),
            _cTokens: toArray(address(cETH))
        });
    }
}

abstract contract RepayBorrowTest is TestBase {
    function __test_repayBorrow_success(
        address[] memory _cTokensCollateral,
        uint256[] memory _cTokensCollateralAmounts,
        address[] memory _underlyingsToBorrowAndRepay,
        uint256[] memory _underlyingsToBorrowAmounts,
        uint256[] memory _underlyingsVaultAmounts,
        uint256[] memory _underlyingsToRepayAmounts
    ) internal {
        __dealCTokenAndAddCollateral({_cTokens: _cTokensCollateral, _amounts: _cTokensCollateralAmounts});

        __borrowAssets({
            _underlyings: _underlyingsToBorrowAndRepay,
            _amounts: _underlyingsToBorrowAmounts,
            _cTokens: _cTokensCollateral
        });

        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            // set vault balances with amounts
            deal({token: _underlyingsToBorrowAndRepay[i], give: _underlyingsVaultAmounts[i], to: vaultProxyAddress});
        }

        // expect emit borrowed asset removed event for every fully-repaid underlying
        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            expectEmit(address(compoundV2DebtPosition));
            emit BorrowedAssetRepaid(
                _underlyingsToBorrowAndRepay[i],
                _underlyingsToBorrowAmounts[i] <= _underlyingsToRepayAmounts[i]
                    ? _underlyingsToBorrowAmounts[i]
                    : _underlyingsToRepayAmounts[i]
            );
        }

        vm.recordLogs();

        __repayBorrowedAssets({_underlyings: _underlyingsToBorrowAndRepay, _amounts: _underlyingsToRepayAmounts});

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            // check the vault balance is correct after repay
            // if the repay amount is greater than the borrowed amount the vault balance should be decreased by the borrowed amount
            // if the repay amount is less than the borrowed amount the vault balance should be decreased by the repay amount
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(
                IERC20(_underlyingsToBorrowAndRepay[i]).balanceOf(vaultProxyAddress),
                _underlyingsVaultAmounts[i] - Math.min(_underlyingsToBorrowAmounts[i], _underlyingsToRepayAmounts[i]),
                1,
                "Vault balance is not correct after repay"
            );

            if (_underlyingsToRepayAmounts[i] >= _underlyingsToBorrowAmounts[i]) {
                // check that the EP no longer considers fully-repaid underlyings as borrowed for the cToken
                assertEq(
                    compoundV2DebtPosition.getCTokenFromBorrowedAsset(_underlyingsToBorrowAndRepay[i]),
                    address(0),
                    "Asset is still borrowed"
                );
            } else {
                address cToken = compoundV2DebtPosition.getCTokenFromBorrowedAsset(_underlyingsToBorrowAndRepay[i]);
                uint256 borrowBalanceStored =
                    ICompoundV2CERC20(cToken).borrowBalanceStored(address(compoundV2DebtPosition));
                // check that the debt decreased
                // 1 wei difference is allowed because of the interest accrued if the collateral is supplied is the same as borrowed asset
                assertApproxEqAbs(
                    borrowBalanceStored,
                    _underlyingsToBorrowAmounts[i] - _underlyingsToRepayAmounts[i],
                    1,
                    "Invalid debt amount"
                );
                // check that the EP has still not fully-repaid underlyings as borrowed for the cToken
                assertNotEq(
                    compoundV2DebtPosition.getCTokenFromBorrowedAsset(_underlyingsToBorrowAndRepay[i]),
                    address(0),
                    "Asset is not borrowed"
                );
            }
        }
    }

    function __test_repayBorrow_failsToRepay(address _cToken) public {
        // Add collateral
        __dealCTokenAndAddCollateral({
            _cTokens: toArray(_cToken),
            _amounts: toArray(100 * assetUnit(IERC20(address(cETH))))
        });

        address underlying = __getCTokenUnderlying(ICompoundV2CERC20(_cToken));
        uint256 amountToBorrow = assetUnit(IERC20(__getCTokenUnderlying(ICompoundV2CERC20(_cToken))));

        // Borrow some assets so we have something to repay
        __borrowAssets({
            _underlyings: toArray(underlying),
            _amounts: toArray(amountToBorrow),
            _cTokens: toArray(_cToken)
        });

        vm.mockCall({
            callee: _cToken,
            data: abi.encodeWithSelector(ICompoundV2CERC20.repayBorrow.selector),
            returnData: abi.encode(1) // return non-zero to trigger the accrueInterest error, (0 is returned on success)
        });

        vm.expectRevert(formatError("__repayBorrowedAsset: Error while repaying borrow"));

        __repayBorrowedAssets({_underlyings: toArray(underlying), _amounts: toArray(uint256(100))});
    }

    function test_repayBorrow_errorWhileCallingAccrueInterest() public {
        // Add collateral
        __dealCTokenAndAddCollateral({
            _cTokens: toArray(address(cETH)),
            _amounts: toArray(100 * assetUnit(IERC20(address(cETH))))
        });

        uint256 amountToBorrow = assetUnit(wethToken);

        // Borrow some assets so we have something to repay
        __borrowAssets({
            _underlyings: toArray(address(wethToken)),
            _amounts: toArray(amountToBorrow),
            _cTokens: toArray(address(cETH))
        });

        vm.mockCall({
            callee: address(cETH),
            data: abi.encodeWithSelector(ICompoundV2CEther.accrueInterest.selector),
            returnData: abi.encode(1) // return non-zero to trigger the accrueInterest error, (0 is returned on success)
        });

        vm.expectRevert("parseAssetsForAction: Error while calling accrueInterest");

        // Try to repay uint256Max so we can trigger the accrueInterest check
        __repayBorrowedAssets({_underlyings: toArray(address(wethToken)), _amounts: toArray(type(uint256).max)});
    }
}

abstract contract ClaimCompTest is TestBase {
    function __test_claimComp_success(address[] memory _cTokens, uint256[] memory _amounts) internal {
        // resurrect cToken distribution program
        increaseTokenBalance({
            _token: IERC20(compToken),
            _to: address(compoundV2Comptroller),
            _amount: 10_000 * assetUnit(IERC20(compToken))
        });

        uint256[] memory distributionSpeeds = new uint256[](_cTokens.length);
        for (uint256 i = 0; i < _cTokens.length; i++) {
            distributionSpeeds[i] = 1 ether;
        }

        vm.prank(compoundV2Comptroller.admin());
        compoundV2Comptroller._setCompSpeeds({
            _cTokens: _cTokens,
            _supplySpeeds: distributionSpeeds,
            _borrowSpeeds: distributionSpeeds
        });

        // add collateral to be able to accrue some rewards
        __dealCTokenAndAddCollateral({_cTokens: _cTokens, _amounts: _amounts});

        // accrue some rewards during block number increase
        vm.roll(block.number + 10_000);

        vm.recordLogs();

        __claimComp();

        // Assert assetsToReceive was correctly formatted (COMP only)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(compToken)
        });

        // check that some amount of reward underlying was claimed and transferred to the vault
        assertGt(IERC20(compToken).balanceOf(vaultProxyAddress), 0, "No rewards claimed");
    }
}

abstract contract CompoundV2DebtPositionTest is
    RepayBorrowTest,
    BorrowTest,
    AddCollateralTest,
    RemoveCollateralTest,
    ClaimCompTest
{}

// Normally in this place there would be tests for getManagedAssets, and getDebtAssets, but in CompoundV2's case it is very straightforward, i.e., there is only one kind of managed asset with one way of calculating it, and same for debt assets.
// Therefore, we don't need to test it.

contract CompoundV2DebtPositionTestEthereum is CompoundV2DebtPositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment();

        compoundV2Comptroller = ICompoundV2Comptroller(ETHEREUM_COMPTROLLER);
        cETH = ICompoundV2CEther(ETHEREUM_COMPOUND_V2_CETH);
        compToken = ETHEREUM_COMP;

        super.setUp();

        // set up all underlyings used in test cases
        __registerCTokensAndUnderlyings(
            toArray(
                ETHEREUM_COMPOUND_V2_CWBTC,
                ETHEREUM_COMPOUND_V2_CETH,
                ETHEREUM_COMPOUND_V2_CDAI,
                ETHEREUM_COMPOUND_V2_CUSDC
            )
        );
    }

    function test_addCollateral_success() public {
        address[] memory cTokens = toArray(
            ETHEREUM_COMPOUND_V2_CWBTC, ETHEREUM_COMPOUND_V2_CWBTC, ETHEREUM_COMPOUND_V2_CETH, ETHEREUM_COMPOUND_V2_CDAI
        );

        uint256[] memory amounts = new uint256[](cTokens.length);
        for (uint256 i = 0; i < cTokens.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(__getCTokenUnderlying(ICompoundV2CERC20(cTokens[i]))));
        }

        __test_addCollateral_success({_cTokens: cTokens, _amounts: amounts});
    }

    function test_removeCollateral_success() public {
        address[] memory cTokens = new address[](5);
        cTokens[0] = ETHEREUM_COMPOUND_V2_CWBTC;
        cTokens[1] = ETHEREUM_COMPOUND_V2_CETH;
        cTokens[2] = ETHEREUM_COMPOUND_V2_CETH;
        cTokens[3] = ETHEREUM_COMPOUND_V2_CDAI;
        cTokens[4] = ETHEREUM_COMPOUND_V2_CUSDC;

        uint256[] memory amountsToAdd = new uint256[](5);
        amountsToAdd[0] = assetUnit(IERC20(cTokens[0]));
        amountsToAdd[1] = assetUnit(IERC20(cTokens[1]));
        amountsToAdd[2] = assetUnit(IERC20(cTokens[2]));
        amountsToAdd[3] = 10_000 * assetUnit(IERC20(cTokens[3]));
        amountsToAdd[4] = 15_000 * assetUnit(IERC20(cTokens[4]));

        uint256[] memory amountsToRemove = new uint256[](5);
        amountsToRemove[0] = assetUnit(IERC20(cTokens[0]));
        amountsToRemove[1] = assetUnit(IERC20(cTokens[1]));
        amountsToRemove[2] = assetUnit(IERC20(cTokens[2]));
        amountsToRemove[3] = assetUnit(IERC20(cTokens[3]));
        amountsToRemove[4] = 10_000 * assetUnit(IERC20(cTokens[4]));

        __test_removeCollateral_success({
            _cTokens: cTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove
        });
    }

    function test_borrow_success() public {
        address[] memory cTokensCollateral = new address[](3);
        cTokensCollateral[0] = ETHEREUM_COMPOUND_V2_CUSDC;
        cTokensCollateral[1] = ETHEREUM_COMPOUND_V2_CDAI;
        cTokensCollateral[2] = ETHEREUM_COMPOUND_V2_CDAI;

        uint256[] memory cTokensCollateralAmounts = new uint256[](3);
        cTokensCollateralAmounts[0] = 100_000 * assetUnit(IERC20(cTokensCollateral[0]));
        cTokensCollateralAmounts[1] = 100_000 * assetUnit(IERC20(cTokensCollateral[1]));
        cTokensCollateralAmounts[2] = 17_000 * assetUnit(IERC20(cTokensCollateral[2]));

        address[] memory underlyingsToBorrow = new address[](3);
        underlyingsToBorrow[0] = ETHEREUM_USDC;
        underlyingsToBorrow[1] = ETHEREUM_DAI;
        underlyingsToBorrow[2] = ETHEREUM_DAI;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 1_000 * assetUnit(IERC20(underlyingsToBorrow[0]));
        underlyingsToBorrowAmounts[1] = 1_000 * assetUnit(IERC20(underlyingsToBorrow[1]));
        underlyingsToBorrowAmounts[2] = 2_000 * assetUnit(IERC20(underlyingsToBorrow[2]));

        __test_borrow_success({
            _cTokensCollateral: cTokensCollateral,
            _cTokensCollateralAmounts: cTokensCollateralAmounts,
            _underlyingsToBorrow: underlyingsToBorrow,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts
        });
    }

    function test_borrow_failsBadTokenCTokenPair() public {
        __test_borrow_failsBadTokenCTokenPair(ETHEREUM_COMPOUND_V2_CUSDC);
    }

    function test_repayBorrow_success() public {
        address[] memory cTokensCollateral = new address[](3);
        cTokensCollateral[0] = ETHEREUM_COMPOUND_V2_CUSDC;
        cTokensCollateral[1] = ETHEREUM_COMPOUND_V2_CDAI;
        cTokensCollateral[2] = ETHEREUM_COMPOUND_V2_CETH;

        uint256[] memory cTokensCollateralAmounts = new uint256[](3);
        cTokensCollateralAmounts[0] = 100_000 * assetUnit(IERC20(cTokensCollateral[0]));
        cTokensCollateralAmounts[1] = 100_000 * assetUnit(IERC20(cTokensCollateral[0]));
        cTokensCollateralAmounts[2] = 100 * assetUnit(IERC20(cTokensCollateral[0]));

        address[] memory underlyingsToBorrowAndRepay = new address[](3);
        underlyingsToBorrowAndRepay[0] = ETHEREUM_USDC;
        underlyingsToBorrowAndRepay[1] = ETHEREUM_DAI;
        underlyingsToBorrowAndRepay[2] = ETHEREUM_WETH;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 1_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToBorrowAmounts[1] = 1_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsToBorrowAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsVaultAmounts = new uint256[](3);
        underlyingsVaultAmounts[0] = 500 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsVaultAmounts[1] = 2_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsVaultAmounts[2] = 2 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsToRepayAmounts = new uint256[](3);
        underlyingsToRepayAmounts[0] = 500 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToRepayAmounts[1] = type(uint256).max;
        underlyingsToRepayAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        __test_repayBorrow_success({
            _cTokensCollateral: cTokensCollateral,
            _cTokensCollateralAmounts: cTokensCollateralAmounts,
            _underlyingsToBorrowAndRepay: underlyingsToBorrowAndRepay,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts,
            _underlyingsVaultAmounts: underlyingsVaultAmounts,
            _underlyingsToRepayAmounts: underlyingsToRepayAmounts
        });
    }

    function test_repayBorrow_failsToRepay() public {
        __test_repayBorrow_failsToRepay(ETHEREUM_COMPOUND_V2_CUSDC);
    }

    function test_claimComp_success() public {
        __test_claimComp_success({
            _cTokens: toArray(ETHEREUM_COMPOUND_V2_CDAI),
            _amounts: toArray(10_000 * assetUnit(IERC20(ETHEREUM_COMPOUND_V2_CDAI)))
        });
    }
}

contract CompoundV2DebtPositionTestEthereumV4 is CompoundV2DebtPositionTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

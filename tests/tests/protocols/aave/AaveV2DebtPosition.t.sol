// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAaveDebtPosition as IAaveDebtPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/aave-v2-debt/IAaveDebtPosition.sol";

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IAaveV2IncentivesController} from "tests/interfaces/external/IAaveV2IncentivesController.sol";
import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV2LendingPoolAddressProvider} from "tests/interfaces/external/IAaveV2LendingPoolAddressProvider.sol";
import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";
import {IAaveV2ProtocolDataProvider} from "tests/interfaces/external/IAaveV2ProtocolDataProvider.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAaveDebtPositionLib} from "tests/interfaces/internal/IAaveDebtPositionLib.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

import {
    ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
    ETHEREUM_INCENTIVES_CONTROLLER,
    ETHEREUM_PROTOCOL_DATA_PROVIDER,
    POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS,
    POLYGON_INCENTIVES_CONTROLLER,
    POLYGON_PROTOCOL_DATA_PROVIDER
} from "./AaveV2Constants.sol";
import {AaveV2Utils} from "./AaveV2Utils.sol";

abstract contract TestBase is AaveV2Utils, IntegrationTest {
    event BorrowedAssetAdded(address indexed asset);
    event BorrowedAssetRemoved(address indexed asset);
    event CollateralAssetAdded(address indexed asset);
    event CollateralAssetRemoved(address indexed asset);

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;

    IAaveDebtPositionLib internal aaveDebtPosition;
    IAaveV2LendingPool internal lendingPool;

    // Set by child contract
    EnzymeVersion internal version;
    IAaveV2IncentivesController internal incentivesController;
    IAaveV2LendingPoolAddressProvider internal poolAddressProvider;
    IAaveV2ProtocolDataProvider internal protocolDataProvider;

    function setUp() public virtual override {
        lendingPool = poolAddressProvider.getLendingPool();

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Deploy all AaveV2Debt dependencies
        uint256 typeId = __deployPositionType({
            _poolAddressProvider: poolAddressProvider,
            _protocolDataProvider: protocolDataProvider,
            _valueInterpreter: IValueInterpreter(address(getValueInterpreterAddressForVersion(version)))
        });

        // Create an empty AaveV2Debt for the fund
        vm.prank(fundOwner);
        aaveDebtPosition = IAaveDebtPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS
    function __deployLib(
        IAaveV2LendingPoolAddressProvider _poolAddressProvider,
        IAaveV2ProtocolDataProvider _protocolDataProvider,
        IAaveV2IncentivesController _incentivesController
    ) internal returns (address lib_) {
        bytes memory args = abi.encode(_protocolDataProvider, _poolAddressProvider, _incentivesController);

        return deployCode("AaveDebtPositionLib.sol", args);
    }

    function __deployParser(IValueInterpreter _valueInterpreter) internal returns (address parser_) {
        bytes memory args = abi.encode(_valueInterpreter);

        return deployCode("AaveDebtPositionParser.sol", args);
    }

    function __deployPositionType(
        IAaveV2LendingPoolAddressProvider _poolAddressProvider,
        IAaveV2ProtocolDataProvider _protocolDataProvider,
        IValueInterpreter _valueInterpreter
    ) internal returns (uint256 typeId_) {
        // Deploy Aave V3 Debt type contracts
        address aaveDebtPositionLibAddress = address(
            __deployLib({
                _poolAddressProvider: _poolAddressProvider,
                _protocolDataProvider: _protocolDataProvider,
                _incentivesController: incentivesController
            })
        );
        address aaveDebtPositionParser = address(__deployParser({_valueInterpreter: _valueInterpreter}));

        // Register AaveV2Debt type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "AAVE_V2_DEBT",
            _lib: aaveDebtPositionLibAddress,
            _parser: aaveDebtPositionParser
        });

        return (typeId_);
    }

    // ACTION HELPERS

    function __addCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_aTokens, _amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveDebtPositionProd.Actions.AddCollateral)
        });
    }

    function __removeCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_aTokens, _amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveDebtPositionProd.Actions.RemoveCollateral)
        });
    }

    function __borrowAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveDebtPositionProd.Actions.Borrow)
        });
    }

    function __repayBorrowedAssets(address[] memory _underlyings, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_underlyings, _amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveDebtPositionProd.Actions.RepayBorrow)
        });
    }

    function __claimRewards(address[] memory _assets) internal {
        bytes memory actionArgs = abi.encode(_assets);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(IAaveDebtPositionProd.Actions.ClaimRewards)
        });
    }

    // MISC HELPERS

    function __getATokenAddress(address _underlying) internal view returns (address) {
        return lendingPool.getReserveData(_underlying).aTokenAddress;
    }

    function __getATokensAddresses(address[] memory _underlyings) internal view returns (address[] memory aTokens_) {
        aTokens_ = new address[](_underlyings.length);

        for (uint256 i = 0; i < _underlyings.length; i++) {
            aTokens_[i] = __getATokenAddress({_underlying: _underlyings[i]});
        }
        return aTokens_;
    }

    function __registerUnderlyingsAndATokensForThem(address[] memory _underlyingAddresses) internal {
        registerUnderlyingsAndATokensForThem({
            _valueInterpreter: IValueInterpreter(address(getValueInterpreterAddressForVersion(version))),
            _underlyings: _underlyingAddresses,
            _lendingPool: address(lendingPool)
        });
    }

    function __dealATokenAndAddCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        // increase underlyings balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            increaseTokenBalance({_token: IERC20(_aTokens[i]), _to: vaultProxyAddress, _amount: _amounts[i]});
        }

        __addCollateral({_aTokens: _aTokens, _amounts: _amounts});
    }
}

abstract contract AddCollateralTest is TestBase {
    function __test_addCollateral_success(address[] memory _aTokens, uint256[] memory _amounts) internal {
        // increase underlyings balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            increaseTokenBalance({_token: IERC20(_aTokens[i]), _to: vaultProxyAddress, _amount: _amounts[i]});
        }

        (address[] memory uniqueATokens, uint256[] memory uniqueATokensAmounts) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amounts, _ceilingAtMax: true});

        // expect emit add collateral event for every added underlying
        for (uint256 i = 0; i < uniqueATokens.length; i++) {
            expectEmit(address(aaveDebtPosition));
            emit CollateralAssetAdded(uniqueATokens[i]);
        }

        __addCollateral({_aTokens: _aTokens, _amounts: _amounts});

        for (uint256 i = 0; i < _aTokens.length; i++) {
            assertTrue(aaveDebtPosition.assetIsCollateral(_aTokens[i]), "Asset is not collateral");
        }

        (address[] memory managedAssets, uint256[] memory managedAmounts) = aaveDebtPosition.getManagedAssets();

        assertEq(managedAssets, uniqueATokens, "Invalid managed assets");

        for (uint256 i = 0; i < managedAmounts.length; i++) {
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(managedAmounts[i], uniqueATokensAmounts[i], 1, "Invalid managed amounts");
        }
    }

    function test_addCollateral_failsNotSupportedAssetAddCollateral() public {
        vm.expectRevert("__validateSupportedAssets: Unsupported asset");

        __addCollateral({_aTokens: toArray(makeAddr("UnsupportedAsset")), _amounts: toArray(1)});
    }
}

abstract contract RemoveCollateralTest is TestBase {
    function __test_removeCollateral_success(
        address[] memory _aTokens,
        uint256[] memory _amountsToAdd,
        uint256[] memory _amountsToRemove
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokens, _amounts: _amountsToAdd});

        (, uint256[] memory uniqueAmountsToAdd) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amountsToAdd, _ceilingAtMax: false});

        (address[] memory uniqueATokensToRemove, uint256[] memory uniqueAmountsToRemove) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amountsToRemove, _ceilingAtMax: true});

        for (uint256 i = 0; i < uniqueATokensToRemove.length; i++) {
            // expect emit remove collateral event for every fully-removed underlying
            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                expectEmit(address(aaveDebtPosition));
                emit CollateralAssetRemoved(uniqueATokensToRemove[i]);
            }
        }

        __removeCollateral({_aTokens: _aTokens, _amounts: _amountsToRemove});

        for (uint256 i = 0; i < uniqueATokensToRemove.length; i++) {
            // assert external position storage removes collateral asset for every fully-removed underlying
            // and check the external position balances are reflecting the removed collateral

            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                assertFalse(aaveDebtPosition.assetIsCollateral(uniqueATokensToRemove[i]), "Asset is collateral");
                assertEq(
                    IERC20(uniqueATokensToRemove[i]).balanceOf(address(aaveDebtPosition)),
                    0,
                    "AToken was not fully-withdrawn"
                );
            } else {
                // 1 wei difference is allowed because of the interest accrued
                assertApproxEqAbs(
                    IERC20(uniqueATokensToRemove[i]).balanceOf(address(aaveDebtPosition)),
                    uniqueAmountsToAdd[i] - uniqueAmountsToRemove[i],
                    1,
                    "AToken was not partially-withdrawn in the expected amount"
                );
            }
        }
    }

    function test_removeCollateral_failsInvalidCollateralAsset() public {
        vm.expectRevert(formatError("__removeCollateralAssets: Invalid collateral asset"));

        __removeCollateral({_aTokens: toArray(makeAddr("InvalidCollateralAsset")), _amounts: toArray(1)});
    }
}

abstract contract BorrowTest is TestBase {
    function __test_borrow_success(
        address[] memory _aTokensCollateral,
        uint256[] memory _aTokensCollateralAmounts,
        address[] memory _underlyingsToBorrow,
        uint256[] memory _underlyingsToBorrowAmounts
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokensCollateral, _amounts: _aTokensCollateralAmounts});

        (address[] memory uniqueTokensToBorrow, uint256[] memory uniqueTokensToBorrowAmounts) = aggregateAssetAmounts({
            _rawAssets: _underlyingsToBorrow,
            _rawAmounts: _underlyingsToBorrowAmounts,
            _ceilingAtMax: false
        });

        // expect the correct event for every unique borrowed underlying
        for (uint256 i = 0; i < uniqueTokensToBorrow.length; i++) {
            expectEmit(address(aaveDebtPosition));
            emit BorrowedAssetAdded(uniqueTokensToBorrow[i]);
        }

        __borrowAssets({_underlyings: _underlyingsToBorrow, _amounts: _underlyingsToBorrowAmounts});

        // assert external position storage saves the borrowed assets
        for (uint256 i = 0; i < uniqueTokensToBorrow.length; i++) {
            assertTrue(aaveDebtPosition.assetIsBorrowed(uniqueTokensToBorrow[i]), "Asset is not borrowed");
        }

        // Assert position value
        (address[] memory debtAssets, uint256[] memory debtAmounts) = aaveDebtPosition.getDebtAssets();

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
        vm.expectRevert("__validateSupportedAssets: Unsupported asset");

        __borrowAssets({_underlyings: toArray(makeAddr("UnsupportedAsset")), _amounts: toArray(1)});
    }
}

abstract contract RepayBorrowTest is TestBase {
    function __test_repayBorrow_success(
        address[] memory _aTokensCollateral,
        uint256[] memory _aTokensCollateralAmounts,
        address[] memory _underlyingsToBorrowAndRepay,
        uint256[] memory _underlyingsToBorrowAmounts,
        uint256[] memory _underlyingsVaultAmounts,
        uint256[] memory _underlyingsToRepayAmounts
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokensCollateral, _amounts: _aTokensCollateralAmounts});

        __borrowAssets({_underlyings: _underlyingsToBorrowAndRepay, _amounts: _underlyingsToBorrowAmounts});

        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            // set vault balances with amounts
            deal({token: _underlyingsToBorrowAndRepay[i], give: _underlyingsVaultAmounts[i], to: vaultProxyAddress});
        }

        // expect emit borrowed asset removed event for every fully-repaid underlying
        for (uint256 i = 0; i < _underlyingsToBorrowAndRepay.length; i++) {
            if (_underlyingsToBorrowAmounts[i] <= _underlyingsToRepayAmounts[i]) {
                expectEmit(address(aaveDebtPosition));
                emit BorrowedAssetRemoved(_underlyingsToBorrowAndRepay[i]);
            }
        }

        __repayBorrowedAssets({_underlyings: _underlyingsToBorrowAndRepay, _amounts: _underlyingsToRepayAmounts});

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
                // check that the EP no longer considers fully-repaid underlyings as borrowed
                assertFalse(
                    aaveDebtPosition.assetIsBorrowed(_underlyingsToBorrowAndRepay[i]), "Asset is still borrowed"
                );
            } else {
                // check that the debt decreased
                // 1 wei difference is allowed because of the interest accrued if the colletaral is supplied is the same as borrowed asset
                assertApproxEqAbs(
                    IERC20(aaveDebtPosition.getDebtTokenForBorrowedAsset(_underlyingsToBorrowAndRepay[i])).balanceOf(
                        address(aaveDebtPosition)
                    ),
                    _underlyingsToBorrowAmounts[i] - _underlyingsToRepayAmounts[i],
                    1,
                    "Invalid debt amount"
                );
                // check that the EP has still not fully-repaid underlyings as borrowed
                assertTrue(aaveDebtPosition.assetIsBorrowed(_underlyingsToBorrowAndRepay[i]), "Asset is not borrowed");
            }
        }
    }

    function test_repayBorrow_failsRepayTokenNotBorrowed() public {
        IERC20 invalidAsset = createTestToken();

        vm.expectRevert(formatError("__repayBorrowedAssets: Invalid borrowed asset"));

        __repayBorrowedAssets({_underlyings: toArray(address(invalidAsset)), _amounts: toArray(uint256(0))});
    }
}

abstract contract ClaimRewardsTest is TestBase {
    function __test_claimRewards_success(address[] memory _aTokens, uint256[] memory _amounts, address _rewardToken)
        internal
    {
        // resurrect incentives controller rewards, as they have already finished for aave V2
        address emmissionManager = incentivesController.EMISSION_MANAGER();
        vm.startPrank(emmissionManager);
        incentivesController.setDistributionEnd(block.timestamp + 365 days);

        uint256[] memory emissionsPerSecond = new uint256[](_aTokens.length);
        for (uint256 i = 0; i < _aTokens.length; i++) {
            emissionsPerSecond[i] = 0.1 ether;
        }
        // configure aTokens emissions per second
        incentivesController.configureAssets({_assets: _aTokens, _emissionsPerSecond: emissionsPerSecond});
        vm.stopPrank();

        __dealATokenAndAddCollateral({_aTokens: _aTokens, _amounts: _amounts});

        // accrue some rewards during the time
        skip(180 days);

        __claimRewards(_aTokens);

        uint256 rewardAmount = IERC20(_rewardToken).balanceOf(vaultProxyAddress);

        // check that some amount of reward underlying was claimed and transferred to the vault
        assertGt(rewardAmount, 0, "No rewards claimed");
    }
}

abstract contract AaveV2DebtPositionTest is
    RepayBorrowTest,
    BorrowTest,
    AddCollateralTest,
    RemoveCollateralTest,
    ClaimRewardsTest
{}

// Normally in this place there would be tests for getManagedAssets, and getDebtAssets, but in Aave's case it is very straightforward, i.e., there is only one kind of managed asset with one way of calculating it, and same for debt assets.
// Therefore, we don't need to test it.

contract AaveV2DebtPositionTestEthereum is AaveV2DebtPositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment();

        poolAddressProvider = IAaveV2LendingPoolAddressProvider(ETHEREUM_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS);
        protocolDataProvider = IAaveV2ProtocolDataProvider(ETHEREUM_PROTOCOL_DATA_PROVIDER);
        incentivesController = IAaveV2IncentivesController(ETHEREUM_INCENTIVES_CONTROLLER);

        super.setUp();

        // set up all underlyings used in test cases
        __registerUnderlyingsAndATokensForThem(toArray(ETHEREUM_WBTC, ETHEREUM_WETH, ETHEREUM_DAI, ETHEREUM_USDC));
    }

    function test_addCollateral_success() public {
        address[] memory underlyings = toArray(ETHEREUM_WBTC, ETHEREUM_DAI, ETHEREUM_DAI);

        uint256[] memory amounts = new uint256[](underlyings.length);
        for (uint256 i = 0; i < underlyings.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(underlyings[i]));
        }

        __test_addCollateral_success({_aTokens: __getATokensAddresses(underlyings), _amounts: amounts});
    }

    function test_removeCollateral_success() public {
        address[] memory aTokens = new address[](5);
        aTokens[0] = __getATokenAddress(ETHEREUM_WBTC);
        aTokens[1] = __getATokenAddress(ETHEREUM_WETH);
        aTokens[2] = __getATokenAddress(ETHEREUM_WETH);
        aTokens[3] = __getATokenAddress(ETHEREUM_DAI);
        aTokens[4] = __getATokenAddress(ETHEREUM_USDC);

        uint256[] memory amountsToAdd = new uint256[](5);
        amountsToAdd[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToAdd[1] = 1 * assetUnit(IERC20(aTokens[1]));
        amountsToAdd[2] = 1 * assetUnit(IERC20(aTokens[2]));
        amountsToAdd[3] = 10_000 * assetUnit(IERC20(aTokens[3]));
        amountsToAdd[4] = 15_000 * assetUnit(IERC20(aTokens[4]));

        uint256[] memory amountsToRemove = new uint256[](5);
        amountsToRemove[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToRemove[1] = 1 * assetUnit(IERC20(aTokens[1]));
        amountsToRemove[2] = 1 * assetUnit(IERC20(aTokens[2]));
        amountsToRemove[3] = type(uint256).max;
        amountsToRemove[4] = 10_000 * assetUnit(IERC20(aTokens[4]));

        __test_removeCollateral_success({
            _aTokens: aTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove
        });
    }

    function test_borrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(ETHEREUM_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(1 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrow = new address[](3);
        underlyingsToBorrow[0] = ETHEREUM_USDC;
        underlyingsToBorrow[1] = ETHEREUM_DAI;
        underlyingsToBorrow[2] = ETHEREUM_DAI;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrow[0]));
        underlyingsToBorrowAmounts[1] = 5_000 * assetUnit(IERC20(underlyingsToBorrow[1]));
        underlyingsToBorrowAmounts[2] = 2_000 * assetUnit(IERC20(underlyingsToBorrow[2]));

        __test_borrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrow: underlyingsToBorrow,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts
        });
    }

    function test_repayBorrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(ETHEREUM_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(4 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrowAndRepay = new address[](3);
        underlyingsToBorrowAndRepay[0] = ETHEREUM_USDC;
        underlyingsToBorrowAndRepay[1] = ETHEREUM_DAI;
        underlyingsToBorrowAndRepay[2] = ETHEREUM_WBTC;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 1_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToBorrowAmounts[1] = 2_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsToBorrowAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsVaultAmounts = new uint256[](3);
        underlyingsVaultAmounts[0] = 500 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsVaultAmounts[1] = 2_500 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsVaultAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsToRepayAmounts = new uint256[](3);
        underlyingsToRepayAmounts[0] = 500 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToRepayAmounts[1] = type(uint256).max;
        underlyingsToRepayAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        __test_repayBorrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrowAndRepay: underlyingsToBorrowAndRepay,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts,
            _underlyingsVaultAmounts: underlyingsVaultAmounts,
            _underlyingsToRepayAmounts: underlyingsToRepayAmounts
        });
    }

    function test_claimRewards_success() public {
        __test_claimRewards_success({
            _aTokens: toArray(__getATokenAddress(ETHEREUM_WBTC), __getATokenAddress(ETHEREUM_DAI)),
            _amounts: toArray(
                1 * assetUnit(IERC20(__getATokenAddress(ETHEREUM_WBTC))),
                1 * assetUnit(IERC20(__getATokenAddress(ETHEREUM_DAI)))
            ),
            _rewardToken: ETHEREUM_STKAAVE
        });
    }
}

contract AaveV2DebtPositionTestPolygon is AaveV2DebtPositionTest {
    function setUp() public virtual override {
        setUpPolygonEnvironment();

        poolAddressProvider = IAaveV2LendingPoolAddressProvider(POLYGON_LENDING_POOL_ADDRESS_PROVIDER_ADDRESS);
        protocolDataProvider = IAaveV2ProtocolDataProvider(POLYGON_PROTOCOL_DATA_PROVIDER);
        incentivesController = IAaveV2IncentivesController(POLYGON_INCENTIVES_CONTROLLER);

        super.setUp();

        // set up all underlyings used in test cases
        __registerUnderlyingsAndATokensForThem(toArray(POLYGON_WBTC, POLYGON_WMATIC, POLYGON_DAI, POLYGON_USDC));
    }

    function test_addCollateral_success() public {
        address[] memory underlyings = toArray(POLYGON_WMATIC, POLYGON_DAI, POLYGON_DAI);

        uint256[] memory amounts = new uint256[](underlyings.length);
        for (uint256 i = 0; i < underlyings.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(underlyings[i]));
        }

        __test_addCollateral_success({_aTokens: __getATokensAddresses(underlyings), _amounts: amounts});
    }

    function test_removeCollateral_success() public {
        address[] memory aTokens = new address[](5);
        aTokens[0] = __getATokenAddress(POLYGON_WBTC);
        aTokens[1] = __getATokenAddress(POLYGON_WMATIC);
        aTokens[2] = __getATokenAddress(POLYGON_WMATIC);
        aTokens[3] = __getATokenAddress(POLYGON_DAI);
        aTokens[4] = __getATokenAddress(POLYGON_USDC);

        uint256[] memory amountsToAdd = new uint256[](5);
        amountsToAdd[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToAdd[1] = 1 * assetUnit(IERC20(aTokens[1])) / 2;
        amountsToAdd[2] = 1 * assetUnit(IERC20(aTokens[2])) / 2;
        amountsToAdd[3] = 10_000 * assetUnit(IERC20(aTokens[3]));
        amountsToAdd[4] = 15_000 * assetUnit(IERC20(aTokens[4]));

        uint256[] memory amountsToRemove = new uint256[](5);
        amountsToRemove[0] = 1 * assetUnit(IERC20(aTokens[0]));
        amountsToRemove[1] = 1 * assetUnit(IERC20(aTokens[1])) / 2;
        amountsToRemove[2] = 1 * assetUnit(IERC20(aTokens[2])) / 2;
        amountsToRemove[3] = type(uint256).max;
        amountsToRemove[4] = 10_000 * assetUnit(IERC20(aTokens[4]));

        __test_removeCollateral_success({
            _aTokens: aTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove
        });
    }

    function test_borrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(POLYGON_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(1 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrow = new address[](3);
        underlyingsToBorrow[0] = POLYGON_USDC;
        underlyingsToBorrow[1] = POLYGON_WMATIC;
        underlyingsToBorrow[2] = POLYGON_WMATIC;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrow[0]));
        underlyingsToBorrowAmounts[1] = 1 * assetUnit(IERC20(underlyingsToBorrow[1]));
        underlyingsToBorrowAmounts[2] = 2 * assetUnit(IERC20(underlyingsToBorrow[2]));

        __test_borrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrow: underlyingsToBorrow,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts
        });
    }

    function test_repayBorrow_success() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(POLYGON_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(4 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory underlyingsToBorrowAndRepay = new address[](3);
        underlyingsToBorrowAndRepay[0] = POLYGON_USDC;
        underlyingsToBorrowAndRepay[1] = POLYGON_WMATIC;
        underlyingsToBorrowAndRepay[2] = POLYGON_WBTC;

        uint256[] memory underlyingsToBorrowAmounts = new uint256[](3);
        underlyingsToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToBorrowAmounts[1] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsToBorrowAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsVaultAmounts = new uint256[](3);
        underlyingsVaultAmounts[0] = 5_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsVaultAmounts[1] = 3 * assetUnit(IERC20(underlyingsToBorrowAndRepay[1]));
        underlyingsVaultAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        uint256[] memory underlyingsToRepayAmounts = new uint256[](3);
        underlyingsToRepayAmounts[0] = 5_000 * assetUnit(IERC20(underlyingsToBorrowAndRepay[0]));
        underlyingsToRepayAmounts[1] = type(uint256).max;
        underlyingsToRepayAmounts[2] = 1 * assetUnit(IERC20(underlyingsToBorrowAndRepay[2]));

        __test_repayBorrow_success({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _underlyingsToBorrowAndRepay: underlyingsToBorrowAndRepay,
            _underlyingsToBorrowAmounts: underlyingsToBorrowAmounts,
            _underlyingsVaultAmounts: underlyingsVaultAmounts,
            _underlyingsToRepayAmounts: underlyingsToRepayAmounts
        });
    }

    function test_claimRewards_success() public {
        __test_claimRewards_success({
            _aTokens: toArray(__getATokenAddress(POLYGON_WBTC), __getATokenAddress(POLYGON_DAI)),
            _amounts: toArray(
                1 * assetUnit(IERC20(__getATokenAddress(POLYGON_WBTC))),
                1 * assetUnit(IERC20(__getATokenAddress(POLYGON_DAI)))
            ),
            _rewardToken: POLYGON_WMATIC
        });
    }
}

contract AaveV2DebtPositionTestEthereumV4 is AaveV2DebtPositionTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract AaveV2DebtPositionTestPolygonV4 is AaveV2DebtPositionTestPolygon {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Math} from "openzeppelin-solc-0.8/utils/math/Math.sol";
import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IAaveV2IncentivesController} from "tests/interfaces/external/IAaveV2IncentivesController.sol";
import {IAaveAToken} from "tests/interfaces/external/IAaveAToken.sol";
import {IAaveV2LendingPoolAddressProvider} from "tests/interfaces/external/IAaveV2LendingPoolAddressProvider.sol";
import {IAaveV2LendingPool} from "tests/interfaces/external/IAaveV2LendingPool.sol";
import {IAaveV2ProtocolDataProvider} from "tests/interfaces/external/IAaveV2ProtocolDataProvider.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IAaveDebtPositionLib} from "tests/interfaces/internal/IAaveDebtPositionLib.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";

enum Actions {
    AddCollateral,
    RemoveCollateral,
    Borrow,
    RepayBorrow,
    ClaimRewards
}

address constant ETHEREUM_POOL_ADDRESS_PROVIDER = 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5;
address constant ETHEREUM_PROTOCOL_DATA_PROVIDER = 0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d;
address constant ETHEREUM_INCENTIVES_CONTROLLER = 0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5;

address constant POLYGON_POOL_ADDRESS_PROVIDER = 0xd05e3E715d945B59290df0ae8eF85c1BdB684744;
address constant POLYGON_PROTOCOL_DATA_PROVIDER = 0x7551b5D2763519d4e37e8B81929D336De671d46d;
address constant POLYGON_INCENTIVES_CONTROLLER = 0x357D51124f59836DeD84c8a1730D72B749d8BC23;

abstract contract TestBase is IntegrationTest {
    event BorrowedAssetAdded(address indexed asset);
    event BorrowedAssetRemoved(address indexed asset);
    event CollateralAssetAdded(address indexed asset);
    event CollateralAssetRemoved(address indexed asset);

    address internal fundOwner = makeAddr("fundOwner");

    IVault internal vaultProxy;
    IComptroller internal comptrollerProxy;

    IAaveDebtPositionLib internal aaveDebtPosition;
    IAaveV2LendingPoolAddressProvider internal poolAddressProvider;
    IAaveV2ProtocolDataProvider internal protocolDataProvider;
    IAaveV2LendingPool internal lendingPool;
    IAaveV2IncentivesController internal incentivesController;

    function setUpTestBase(
        address _poolAddressProvider,
        address _protocolDataProvider,
        address _incentivesController,
        address[] memory _tokens
    ) internal {
        poolAddressProvider = IAaveV2LendingPoolAddressProvider(_poolAddressProvider);
        protocolDataProvider = IAaveV2ProtocolDataProvider(_protocolDataProvider);
        lendingPool = poolAddressProvider.getLendingPool();
        incentivesController = IAaveV2IncentivesController(_incentivesController);

        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: fundOwner,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 1000 ether,
            _sharesBuyer: fundOwner
        });

        // Deploy all AaveV2Debt dependencies
        uint256 typeId = __deployPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _poolAddressProvider: poolAddressProvider,
            _protocolDataProvider: protocolDataProvider,
            _valueInterpreter: core.release.valueInterpreter
        });

        // Create an empty AaveV2Debt for the fund
        vm.prank(fundOwner);
        aaveDebtPosition = IAaveDebtPositionLib(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: comptrollerProxy,
                _typeId: typeId,
                _initializationData: "",
                _callOnExternalPositionCallArgs: ""
            })
        );

        __registerTokensAndATokensForThem(_tokens);
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
        IExternalPositionManager _externalPositionManager,
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
        typeId_ = registerExternalPositionType({
            _externalPositionManager: _externalPositionManager,
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
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.AddCollateral)
        });
    }

    function __removeCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_aTokens, _amounts);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.RemoveCollateral)
        });
    }

    function __borrowAssets(address[] memory _tokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_tokens, _amounts);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.Borrow)
        });
    }

    function __repayBorrowedAssets(address[] memory _tokens, uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_tokens, _amounts);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.RepayBorrow)
        });
    }

    function __claimRewards(address[] memory _assets) internal {
        bytes memory actionArgs = abi.encode(_assets);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(aaveDebtPosition),
            _actionArgs: actionArgs,
            _actionId: uint256(Actions.ClaimRewards)
        });
    }

    // MISC HELPERS

    function __getATokenAddress(address _token) internal returns (address) {
        return lendingPool.getReserveData(_token).aTokenAddress;
    }

    function __getATokensAddresses(address[] memory _tokens) internal returns (address[] memory aTokens_) {
        aTokens_ = new address[](_tokens.length);

        for (uint256 i = 0; i < _tokens.length; i++) {
            aTokens_[i] = __getATokenAddress({_token: _tokens[i]});
        }
        return aTokens_;
    }

    function __registerTokensAndATokensForThem(address[] memory _tokenAddresses) internal {
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            // Register underlying token
            addPrimitiveWithTestAggregator({
                _valueInterpreter: core.release.valueInterpreter,
                _tokenAddress: _tokenAddresses[i],
                _skipIfRegistered: true
            });

            // Register aToken
            addPrimitiveWithTestAggregator({
                _valueInterpreter: core.release.valueInterpreter,
                _tokenAddress: __getATokenAddress({_token: _tokenAddresses[i]}),
                _skipIfRegistered: true
            });
        }
    }

    function __increaseATokenBalance(IAaveAToken _aToken, address _to, uint256 _amount) internal {
        IERC20 underlyingToken = IERC20(_aToken.UNDERLYING_ASSET_ADDRESS());

        increaseTokenBalance(underlyingToken, _to, _amount);
        vm.startPrank(_to);
        underlyingToken.approve(address(lendingPool), _amount);
        lendingPool.deposit(address(underlyingToken), _amount, _to, 0);
        vm.stopPrank();
    }

    function __dealATokenAndAddCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        // increase tokens balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            __increaseATokenBalance({_aToken: IAaveAToken(_aTokens[i]), _to: address(vaultProxy), _amount: _amounts[i]});
        }

        __addCollateral({_aTokens: _aTokens, _amounts: _amounts});
    }
}

abstract contract AddCollateralTest is TestBase {
    function __test_successAddCollateral(address[] memory _aTokens, uint256[] memory _amounts) internal {
        // increase tokens balance for vault with amounts
        for (uint256 i = 0; i < _aTokens.length; i++) {
            __increaseATokenBalance({_aToken: IAaveAToken(_aTokens[i]), _to: address(vaultProxy), _amount: _amounts[i]});
        }

        (address[] memory uniqueATokens, uint256[] memory uniqueATokensAmounts) =
            aggregateAssetAmounts({_rawAssets: _aTokens, _rawAmounts: _amounts, _ceilingAtMax: true});

        // expect emit add collateral event for every added token
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

    function test_failNotSupportedAssetAddCollateral() public {
        vm.expectRevert("__validateSupportedAssets: Unsupported asset");

        __addCollateral({_aTokens: toArray(makeAddr("UnsupportedAsset")), _amounts: toArray(1)});
    }
}

abstract contract RemoveCollateralTest is TestBase {
    function __test_successRemoveCollateral(
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
            // expect emit remove collateral event for every fully-removed token
            if (uniqueAmountsToRemove[i] == uniqueAmountsToAdd[i] || uniqueAmountsToRemove[i] == type(uint256).max) {
                expectEmit(address(aaveDebtPosition));
                emit CollateralAssetRemoved(uniqueATokensToRemove[i]);
            }
        }

        __removeCollateral({_aTokens: _aTokens, _amounts: _amountsToRemove});

        for (uint256 i = 0; i < uniqueATokensToRemove.length; i++) {
            // assert external position storage removes collateral asset for every fully-removed token
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

    function test_failInvalidCollateralAsset() public {
        vm.expectRevert(formatError("__removeCollateralAssets: Invalid collateral asset"));

        __removeCollateral({_aTokens: toArray(makeAddr("InvalidCollateralAsset")), _amounts: toArray(1)});
    }
}

abstract contract BorrowTest is TestBase {
    function __test_successBorrow(
        address[] memory _aTokensCollateral,
        uint256[] memory _aTokensCollateralAmounts,
        address[] memory _tokensToBorrow,
        uint256[] memory _tokensToBorrowAmounts
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokensCollateral, _amounts: _aTokensCollateralAmounts});

        (address[] memory uniqueTokensToBorrow, uint256[] memory uniqueTokensToBorrowAmounts) = aggregateAssetAmounts({
            _rawAssets: _tokensToBorrow,
            _rawAmounts: _tokensToBorrowAmounts,
            _ceilingAtMax: false
        });

        // expect the correct event for every unique borrowed token
        for (uint256 i = 0; i < uniqueTokensToBorrow.length; i++) {
            expectEmit(address(aaveDebtPosition));
            emit BorrowedAssetAdded(uniqueTokensToBorrow[i]);
        }

        __borrowAssets({_tokens: _tokensToBorrow, _amounts: _tokensToBorrowAmounts});

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
                IERC20(uniqueTokensToBorrow[i]).balanceOf(address(vaultProxy)),
                uniqueTokensToBorrowAmounts[i],
                "Borrowed asset amount was not sent to the vault"
            );
        }
    }

    function test_failNotSupportedAssetBorrow() public {
        vm.expectRevert("__validateSupportedAssets: Unsupported asset");

        __borrowAssets({_tokens: toArray(makeAddr("UnsupportedAsset")), _amounts: toArray(1)});
    }
}

abstract contract RepayBorrowTest is TestBase {
    function __test_successRepayBorrow(
        address[] memory _aTokensCollateral,
        uint256[] memory _aTokensCollateralAmounts,
        address[] memory _tokensToBorrowAndRepay,
        uint256[] memory _tokensToBorrowAmounts,
        uint256[] memory _tokensVaultAmounts,
        uint256[] memory _tokensToRepayAmounts
    ) internal {
        __dealATokenAndAddCollateral({_aTokens: _aTokensCollateral, _amounts: _aTokensCollateralAmounts});

        __borrowAssets({_tokens: _tokensToBorrowAndRepay, _amounts: _tokensToBorrowAmounts});

        for (uint256 i = 0; i < _tokensToBorrowAndRepay.length; i++) {
            // set vault balances with amounts
            deal({token: _tokensToBorrowAndRepay[i], give: _tokensVaultAmounts[i], to: address(vaultProxy)});
        }

        // expect emit borrowed asset removed event for every fully-repaid token
        for (uint256 i = 0; i < _tokensToBorrowAndRepay.length; i++) {
            if (_tokensToBorrowAmounts[i] <= _tokensToRepayAmounts[i]) {
                expectEmit(address(aaveDebtPosition));
                emit BorrowedAssetRemoved(_tokensToBorrowAndRepay[i]);
            }
        }

        __repayBorrowedAssets({_tokens: _tokensToBorrowAndRepay, _amounts: _tokensToRepayAmounts});

        for (uint256 i = 0; i < _tokensToBorrowAndRepay.length; i++) {
            // check the vault balance is correct after repay
            // if the repay amount is greater than the borrowed amount the vault balance should be decreased by the borrowed amount
            // if the repay amount is less than the borrowed amount the vault balance should be decreased by the repay amount
            // 1 wei difference is allowed because of the interest accrued
            assertApproxEqAbs(
                IERC20(_tokensToBorrowAndRepay[i]).balanceOf(address(vaultProxy)),
                _tokensVaultAmounts[i] - Math.min(_tokensToBorrowAmounts[i], _tokensToRepayAmounts[i]),
                1,
                "Vault balance is not correct after repay"
            );

            if (_tokensToRepayAmounts[i] >= _tokensToBorrowAmounts[i]) {
                // check that the EP no longer considers fully-repaid tokens as borrowed
                assertFalse(aaveDebtPosition.assetIsBorrowed(_tokensToBorrowAndRepay[i]), "Asset is still borrowed");
            } else {
                // check that the debt decreased
                // 1 wei difference is allowed because of the interest accrued if the colletaral is supplied is the same as borrowed asset
                assertApproxEqAbs(
                    IERC20(aaveDebtPosition.getDebtTokenForBorrowedAsset(_tokensToBorrowAndRepay[i])).balanceOf(
                        address(aaveDebtPosition)
                    ),
                    _tokensToBorrowAmounts[i] - _tokensToRepayAmounts[i],
                    1,
                    "Invalid debt amount"
                );
                // check that the EP has still not fully-repaid tokens as borrowed
                assertTrue(aaveDebtPosition.assetIsBorrowed(_tokensToBorrowAndRepay[i]), "Asset is not borrowed");
            }
        }
    }

    function test_failRepayTokenNotBorrowed() public {
        IERC20 invalidAsset = createTestToken();

        vm.expectRevert(formatError("__repayBorrowedAssets: Invalid borrowed asset"));

        __repayBorrowedAssets({_tokens: toArray(address(invalidAsset)), _amounts: toArray(uint256(0))});
    }
}

abstract contract ClaimRewardsTest is TestBase {
    function __test_successClaimRewards(address[] memory _aTokens, uint256[] memory _amounts, address _rewardToken)
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

        uint256 rewardAmount = IERC20(_rewardToken).balanceOf(address(vaultProxy));

        // check that some amount of reward token was claimed and transferred to the vault
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
    function setUp() public override {
        setUpMainnetEnvironment();
        setUpTestBase({
            _poolAddressProvider: ETHEREUM_POOL_ADDRESS_PROVIDER,
            _protocolDataProvider: ETHEREUM_PROTOCOL_DATA_PROVIDER,
            _incentivesController: ETHEREUM_INCENTIVES_CONTROLLER,
            // set up all tokens used in test cases
            _tokens: toArray(ETHEREUM_WBTC, ETHEREUM_LINK, ETHEREUM_DAI, ETHEREUM_USDC)
        });
    }

    function test_successAddCollateral() public {
        address[] memory tokens = toArray(ETHEREUM_WBTC, ETHEREUM_DAI, ETHEREUM_DAI);

        uint256[] memory amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(tokens[i]));
        }

        __test_successAddCollateral({_aTokens: __getATokensAddresses(tokens), _amounts: amounts});
    }

    function test_successRemoveCollateral() public {
        address[] memory aTokens = new address[](5);
        aTokens[0] = __getATokenAddress(ETHEREUM_WBTC);
        aTokens[1] = __getATokenAddress(ETHEREUM_LINK);
        aTokens[2] = __getATokenAddress(ETHEREUM_LINK);
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

        __test_successRemoveCollateral({
            _aTokens: aTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove
        });
    }

    function test_successBorrow() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(ETHEREUM_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(1 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory tokensToBorrow = new address[](3);
        tokensToBorrow[0] = ETHEREUM_USDC;
        tokensToBorrow[1] = ETHEREUM_DAI;
        tokensToBorrow[2] = ETHEREUM_DAI;

        uint256[] memory tokensToBorrowAmounts = new uint256[](3);
        tokensToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(tokensToBorrow[0]));
        tokensToBorrowAmounts[1] = 5_000 * assetUnit(IERC20(tokensToBorrow[1]));
        tokensToBorrowAmounts[2] = 2_000 * assetUnit(IERC20(tokensToBorrow[2]));

        __test_successBorrow({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _tokensToBorrow: tokensToBorrow,
            _tokensToBorrowAmounts: tokensToBorrowAmounts
        });
    }

    function test_successRepayBorrow() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(ETHEREUM_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(4 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory tokensToBorrowAndRepay = new address[](3);
        tokensToBorrowAndRepay[0] = ETHEREUM_USDC;
        tokensToBorrowAndRepay[1] = ETHEREUM_DAI;
        tokensToBorrowAndRepay[2] = ETHEREUM_WBTC;

        uint256[] memory tokensToBorrowAmounts = new uint256[](3);
        tokensToBorrowAmounts[0] = 1_000 * assetUnit(IERC20(tokensToBorrowAndRepay[0]));
        tokensToBorrowAmounts[1] = 2_000 * assetUnit(IERC20(tokensToBorrowAndRepay[1]));
        tokensToBorrowAmounts[2] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[2]));

        uint256[] memory tokensVaultAmounts = new uint256[](3);
        tokensVaultAmounts[0] = 500 * assetUnit(IERC20(tokensToBorrowAndRepay[0]));
        tokensVaultAmounts[1] = 2_000 * assetUnit(IERC20(tokensToBorrowAndRepay[1]));
        tokensVaultAmounts[2] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[2]));

        uint256[] memory tokensToRepayAmounts = new uint256[](3);
        tokensToRepayAmounts[0] = 500 * assetUnit(IERC20(tokensToBorrowAndRepay[0]));
        tokensToRepayAmounts[1] = type(uint256).max;
        tokensToRepayAmounts[2] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[2]));

        __test_successRepayBorrow({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _tokensToBorrowAndRepay: tokensToBorrowAndRepay,
            _tokensToBorrowAmounts: tokensToBorrowAmounts,
            _tokensVaultAmounts: tokensVaultAmounts,
            _tokensToRepayAmounts: tokensToRepayAmounts
        });
    }

    function test_successClaimRewards() public {
        __test_successClaimRewards({
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
    function setUp() public override {
        setUpPolygonEnvironment();
        setUpTestBase({
            _poolAddressProvider: POLYGON_POOL_ADDRESS_PROVIDER,
            _protocolDataProvider: POLYGON_PROTOCOL_DATA_PROVIDER,
            _incentivesController: POLYGON_INCENTIVES_CONTROLLER,
            // set up all tokens used in test cases
            _tokens: toArray(POLYGON_WBTC, POLYGON_WMATIC, POLYGON_DAI, POLYGON_USDC)
        });
    }

    function test_successAddCollateral() public {
        address[] memory tokens = toArray(POLYGON_WMATIC, POLYGON_DAI, POLYGON_DAI);

        uint256[] memory amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = (i + 1) * assetUnit(IERC20(tokens[i]));
        }

        __test_successAddCollateral({_aTokens: __getATokensAddresses(tokens), _amounts: amounts});
    }

    function test_successRemoveCollateral() public {
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

        __test_successRemoveCollateral({
            _aTokens: aTokens,
            _amountsToAdd: amountsToAdd,
            _amountsToRemove: amountsToRemove
        });
    }

    function test_successBorrow() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(POLYGON_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(1 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory tokensToBorrow = new address[](3);
        tokensToBorrow[0] = POLYGON_USDC;
        tokensToBorrow[1] = POLYGON_WMATIC;
        tokensToBorrow[2] = POLYGON_WMATIC;

        uint256[] memory tokensToBorrowAmounts = new uint256[](3);
        tokensToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(tokensToBorrow[0]));
        tokensToBorrowAmounts[1] = 1 * assetUnit(IERC20(tokensToBorrow[1]));
        tokensToBorrowAmounts[2] = 2 * assetUnit(IERC20(tokensToBorrow[2]));

        __test_successBorrow({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _tokensToBorrow: tokensToBorrow,
            _tokensToBorrowAmounts: tokensToBorrowAmounts
        });
    }

    function test_successRepayBorrow() public {
        address[] memory aTokensCollateral = toArray(__getATokenAddress(POLYGON_WBTC));

        uint256[] memory aTokensCollateralAmounts = toArray(4 * assetUnit(IERC20(aTokensCollateral[0])));

        address[] memory tokensToBorrowAndRepay = new address[](3);
        tokensToBorrowAndRepay[0] = POLYGON_USDC;
        tokensToBorrowAndRepay[1] = POLYGON_WMATIC;
        tokensToBorrowAndRepay[2] = POLYGON_WBTC;

        uint256[] memory tokensToBorrowAmounts = new uint256[](3);
        tokensToBorrowAmounts[0] = 10_000 * assetUnit(IERC20(tokensToBorrowAndRepay[0]));
        tokensToBorrowAmounts[1] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[1]));
        tokensToBorrowAmounts[2] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[2]));

        uint256[] memory tokensVaultAmounts = new uint256[](3);
        tokensVaultAmounts[0] = 5_000 * assetUnit(IERC20(tokensToBorrowAndRepay[0]));
        tokensVaultAmounts[1] = 3 * assetUnit(IERC20(tokensToBorrowAndRepay[1]));
        tokensVaultAmounts[2] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[2]));

        uint256[] memory tokensToRepayAmounts = new uint256[](3);
        tokensToRepayAmounts[0] = 5_000 * assetUnit(IERC20(tokensToBorrowAndRepay[0]));
        tokensToRepayAmounts[1] = type(uint256).max;
        tokensToRepayAmounts[2] = 1 * assetUnit(IERC20(tokensToBorrowAndRepay[2]));

        __test_successRepayBorrow({
            _aTokensCollateral: aTokensCollateral,
            _aTokensCollateralAmounts: aTokensCollateralAmounts,
            _tokensToBorrowAndRepay: tokensToBorrowAndRepay,
            _tokensToBorrowAmounts: tokensToBorrowAmounts,
            _tokensVaultAmounts: tokensVaultAmounts,
            _tokensToRepayAmounts: tokensToRepayAmounts
        });
    }

    function test_successClaimRewards() public {
        __test_successClaimRewards({
            _aTokens: toArray(__getATokenAddress(POLYGON_WBTC), __getATokenAddress(POLYGON_DAI)),
            _amounts: toArray(
                1 * assetUnit(IERC20(__getATokenAddress(POLYGON_WBTC))),
                1 * assetUnit(IERC20(__getATokenAddress(POLYGON_DAI)))
                ),
            _rewardToken: POLYGON_WMATIC
        });
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ITheGraphDelegationPosition as ITheGraphDelegationPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/the-graph-delegation/ITheGraphDelegationPosition.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ITheGraphController} from "tests/interfaces/external/ITheGraphController.sol";
import {ITheGraphEpochManager} from "tests/interfaces/external/ITheGraphEpochManager.sol";
import {ITheGraphStaking} from "tests/interfaces/external/ITheGraphStaking.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {ITheGraphDelegationPositionLib} from "tests/interfaces/internal/ITheGraphDelegationPositionLib.sol";
import {ITheGraphDelegationPositionParser} from "tests/interfaces/internal/ITheGraphDelegationPositionParser.sol";

// ETHEREUM MAINNET CONSTANTS
address constant ETHEREUM_THE_GRAPH_CONTROLLER = 0x24CCD4D3Ac8529fF08c58F74ff6755036E616117;
// src: https://graphscan.io/#indexers
address constant ETHEREUM_THE_GRAPH_INDEXER_1 = 0xA28a99B0219A34142a9398a19460Fcd69250A2B2;
address constant ETHEREUM_THE_GRAPH_INDEXER_2 = 0x474E571Ab6dd77489EC3C7DDF9CBc893FcbA684C;

// ARBITRUM CONSTANTS
address constant ARBITRUM_THE_GRAPH_CONTROLLER = 0x0a8491544221dd212964fbb96487467291b2C97e;
// src: https://graphscan.io/#indexers
address constant ARBITRUM_THE_GRAPH_INDEXER_1 = 0x2f09092aacd80196FC984908c5A9a7aB3ee4f1CE;
address constant ARBITRUM_THE_GRAPH_INDEXER_2 = 0xF9123292b4d958C53aaaD8c5df0138EE0E62944B;

abstract contract TheGraphDelegationTestBase is IntegrationTest {
    event IndexerAdded(address indexed indexer);

    event IndexerRemoved(address indexed indexer);

    uint256 internal theGraphDelegationTypeId;
    ITheGraphDelegationPositionLib internal theGraphDelegationPositionLib;
    ITheGraphDelegationPositionParser internal theGraphDelegationPositionParser;
    ITheGraphDelegationPositionLib internal theGraphDelegationExternalPosition;

    ITheGraphController internal theGraphController;
    ITheGraphEpochManager internal theGraphEpochManager;
    ITheGraphStaking internal theGraphStaking;
    IERC20 internal grtToken;
    address[] internal indexers;
    uint256 delegationAmount;
    uint256 delegationFeeAmount;

    address internal comptrollerProxyAddress;
    address internal fundOwner;
    address internal listOwner;
    address internal vaultProxyAddress;
    IExternalPositionManager internal externalPositionManager;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        uint256 _forkBlock,
        address _theGraphControllerAddress,
        address[] memory _indexerAddresses
    ) internal {
        version = _version;

        setUpNetworkEnvironment({_chainId: _chainId, _forkBlock: _forkBlock});

        theGraphController = ITheGraphController(_theGraphControllerAddress);

        theGraphEpochManager = ITheGraphEpochManager(theGraphController.getContractProxy(keccak256("EpochManager")));
        theGraphStaking = ITheGraphStaking(theGraphController.getContractProxy(keccak256("Staking")));
        grtToken = IERC20(theGraphController.getContractProxy(keccak256("GraphToken")));
        indexers = _indexerAddresses;

        externalPositionManager = IExternalPositionManager(getExternalPositionManagerAddressForVersion(version));
        (theGraphDelegationPositionLib, theGraphDelegationPositionParser, theGraphDelegationTypeId) =
        deployTheGraphDelegation({
            _theGraphStakingAddress: address(theGraphStaking),
            _grtTokenAddress: address(grtToken)
        });

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        vm.prank(fundOwner);
        theGraphDelegationExternalPosition = ITheGraphDelegationPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: theGraphDelegationTypeId,
                _initializationData: ""
            })
        );

        // Add the grtToken to the asset universe
        addPrimitiveWithTestAggregator({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(grtToken),
            _skipIfRegistered: true
        });

        // Increase the loanToken and collateralToken balances
        increaseTokenBalance({_token: grtToken, _to: vaultProxyAddress, _amount: assetUnit(grtToken) * 678});

        delegationAmount = grtToken.balanceOf(vaultProxyAddress) / 7;
        delegationFeeAmount =
            delegationAmount * theGraphStaking.delegationTaxPercentage() / (BPS_ONE_HUNDRED_PERCENT * 100);
    }

    // DEPLOYMENT HELPERS

    function deployTheGraphDelegation(address _theGraphStakingAddress, address _grtTokenAddress)
        public
        returns (
            ITheGraphDelegationPositionLib theGraphDelegationPositionLib_,
            ITheGraphDelegationPositionParser theGraphDelegationPositionParser_,
            uint256 typeId_
        )
    {
        theGraphDelegationPositionLib_ = deployTheGraphDelegationPositionLib({
            _theGraphStakingAddress: _theGraphStakingAddress,
            _grtTokenAddress: _grtTokenAddress
        });
        theGraphDelegationPositionParser_ = deployTheGraphDelegationPositionParser({_grtTokenAddress: _grtTokenAddress});

        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "THE_GRAPH_DELEGATION",
            _lib: address(theGraphDelegationPositionLib_),
            _parser: address(theGraphDelegationPositionParser_)
        });

        return (theGraphDelegationPositionLib_, theGraphDelegationPositionParser_, typeId_);
    }

    function deployTheGraphDelegationPositionLib(address _theGraphStakingAddress, address _grtTokenAddress)
        public
        returns (ITheGraphDelegationPositionLib)
    {
        bytes memory args = abi.encode(_theGraphStakingAddress, _grtTokenAddress);
        address addr = deployCode("TheGraphDelegationPositionLib.sol", args);
        return ITheGraphDelegationPositionLib(addr);
    }

    function deployTheGraphDelegationPositionParser(address _grtTokenAddress)
        public
        returns (ITheGraphDelegationPositionParser)
    {
        bytes memory args = abi.encode(_grtTokenAddress);
        address addr = deployCode("TheGraphDelegationPositionParser.sol", args);
        return ITheGraphDelegationPositionParser(addr);
    }

    // ACTION HELPERS

    function __delegate(address _indexer, uint256 _tokens) private {
        bytes memory actionArgs = abi.encode(_indexer, _tokens);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(theGraphDelegationExternalPosition),
            _actionId: uint256(ITheGraphDelegationPositionProd.Actions.Delegate),
            _actionArgs: actionArgs
        });
    }

    function __undelegate(address _indexer, uint256 _shares) private {
        bytes memory actionArgs = abi.encode(_indexer, _shares);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(theGraphDelegationExternalPosition),
            _actionId: uint256(ITheGraphDelegationPositionProd.Actions.Undelegate),
            _actionArgs: actionArgs
        });
    }

    function __withdraw(address _indexer, address _nextIndexer) private {
        bytes memory actionArgs = abi.encode(_indexer, _nextIndexer);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(theGraphDelegationExternalPosition),
            _actionId: uint256(ITheGraphDelegationPositionProd.Actions.Withdraw),
            _actionArgs: actionArgs
        });
    }

    function __fastForwardEpoch() private {
        vm.prank(theGraphController.getGovernor());

        // Reduce epoch length to the minimum
        theGraphEpochManager.setEpochLength(1);

        // Increase the block by 1 to trigger a new epoch
        vm.roll(block.number + 1);
    }

    // TESTS

    function __test_delegate(address[] memory _indexers) private {
        uint256 preDelegateFundGrtBalance = grtToken.balanceOf(vaultProxyAddress);
        uint256 totalDelegatedAmount = delegationAmount * _indexers.length;
        uint256 totalDelegationFeeAmount = delegationFeeAmount * _indexers.length;

        for (uint256 i; i < _indexers.length; i++) {
            vm.recordLogs();

            expectEmit(address(theGraphDelegationExternalPosition));
            emit IndexerAdded(_indexers[i]);

            __delegate({_indexer: _indexers[i], _tokens: delegationAmount});

            assertExternalPositionAssetsToReceive({
                _logs: vm.getRecordedLogs(),
                _externalPositionManager: externalPositionManager,
                _assets: new address[](0)
            });
        }

        // Assert that the delegation position has been added to storage
        assertEq(theGraphDelegationExternalPosition.getIndexers(), _indexers, "Incorrect stored indexers");

        for (uint256 i; i < _indexers.length; i++) {
            assertEq(
                theGraphDelegationExternalPosition.isDelegatorTo({_indexer: _indexers[i]}),
                true,
                "Incorrect delegator status"
            );
        }

        // Assert that the GRT balance of the fund has decreased
        assertEq(
            grtToken.balanceOf(vaultProxyAddress),
            preDelegateFundGrtBalance - totalDelegatedAmount,
            "Incorrect vault grt balance"
        );

        // Assert that the delegation value is reflected in the EP
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            theGraphDelegationExternalPosition.getManagedAssets();

        // There can be some rounding errors in the delegation fee amount, so we need to allow for a small margin of error of 1 wei per position
        uint256 errorMargin = _indexers.length;
        assertEq(managedAssets, toArray(address(grtToken)), "Incorrect managed assets");
        assertEq(managedAssetAmounts.length, 1, "Incorrect managed asset amounts length");
        assertApproxEqAbs(
            managedAssetAmounts[0],
            (totalDelegatedAmount - totalDelegationFeeAmount),
            errorMargin,
            "Incorrect managed asset amounts balance"
        );
    }

    function test_delegate_success() public {
        __test_delegate({_indexers: toArray(indexers[0])});
    }

    function test_delegate_successRepeatDelegate() public {
        address indexer = indexers[0];
        uint256 totalDelegatedAmount = delegationAmount * 2;
        uint256 totalDelegationFeeAmount = delegationFeeAmount * 2;

        __test_delegate({_indexers: toArray(indexer)});

        // Delegate to the same indexer again
        __delegate({_indexer: indexer, _tokens: delegationAmount});

        // Assert that the indexer is only in storage once
        assertEq(theGraphDelegationExternalPosition.getIndexers(), toArray(indexer), "Incorrect stored indexers");

        // Assert that the delegation value is reflected in the EP
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            theGraphDelegationExternalPosition.getManagedAssets();

        assertEq(managedAssets, toArray(address(grtToken)), "Incorrect managed assets");
        // Allow 1 wei of difference due to rounding
        assertApproxEqAbs(
            managedAssetAmounts[0],
            (totalDelegatedAmount - totalDelegationFeeAmount),
            1,
            "Incorrect managed asset amounts"
        );
    }

    function test_delegate_successMultipleIndexers() public {
        __test_delegate({_indexers: indexers});
    }

    function test_undelegate_success() public {
        address indexer = indexers[0];
        __delegate({_indexer: indexer, _tokens: delegationAmount});

        (uint256 delegationShares,,) =
            theGraphStaking.getDelegation(indexer, address(theGraphDelegationExternalPosition));

        uint256 undelegatedShares = delegationShares / 3;
        (,,,, uint256 poolTokens, uint256 poolShares) = theGraphStaking.delegationPools(indexer);
        uint256 undelegatedTokensAmount = undelegatedShares * poolTokens / poolShares;

        vm.recordLogs();

        __undelegate({_indexer: indexer, _shares: undelegatedShares});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(grtToken))
        });

        // The indexer should still be in storage (undelegated, but not removed)
        assertEq(theGraphDelegationExternalPosition.getIndexers(), toArray(indexer), "Incorrect stored indexers");
        assertEq(
            theGraphDelegationExternalPosition.isDelegatorTo({_indexer: indexer}), true, "Incorrect delegator status"
        );

        // The full value of the delegation should still be accounted for
        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            theGraphDelegationExternalPosition.getManagedAssets();

        assertEq(managedAssets, toArray(address(grtToken)), "Incorrect managed assets");
        assertApproxEqAbs(
            managedAssetAmounts[0], delegationAmount - delegationFeeAmount, 2, "Incorrect managed asset amounts"
        );

        // Assert that the undelegated grtTokens are now locked
        (, uint256 tokensLocked,) = theGraphStaking.getDelegation(indexer, address(theGraphDelegationExternalPosition));
        assertEq(tokensLocked, undelegatedTokensAmount, "Incorrect tokens locked");
    }

    function __test_withdraw(bool _redelegate, bool _withdrawAll) private {
        address indexer = indexers[0];
        address nextIndexer = _redelegate ? indexers[1] : address(0);
        __delegate({_indexer: indexer, _tokens: delegationAmount});

        (uint256 delegationShares,,) =
            theGraphStaking.getDelegation(indexer, address(theGraphDelegationExternalPosition));

        uint256 withdrawalAmount = _withdrawAll ? delegationShares : delegationShares / 3;

        (,,,, uint256 poolTokens, uint256 poolShares) = theGraphStaking.delegationPools(indexer);
        uint256 withdrawalGrtValue = withdrawalAmount * poolTokens / poolShares;

        __undelegate({_indexer: indexer, _shares: withdrawalAmount});

        // Fast forward past the withdrawal waiting period
        __fastForwardEpoch();

        vm.recordLogs();

        if (_withdrawAll) {
            expectEmit(address(theGraphDelegationExternalPosition));
            emit IndexerRemoved(indexer);
        }

        if (_redelegate) {
            expectEmit(address(theGraphDelegationExternalPosition));
            emit IndexerAdded(nextIndexer);
        }

        uint256 preWithdrawalFundGrtBalance = grtToken.balanceOf(vaultProxyAddress);

        __withdraw({_indexer: indexer, _nextIndexer: nextIndexer});

        uint256 postWithdrawalFundGrtBalance = grtToken.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(grtToken))
        });

        {
            address[] memory expectedIndexers = _withdrawAll
                ? _redelegate ? toArray(nextIndexer) : new address[](0)
                : _redelegate ? toArray(indexer, nextIndexer) : toArray(indexer);

            assertEq(theGraphDelegationExternalPosition.getIndexers(), expectedIndexers, "Incorrect stored indexers");
            for (uint256 i; i < expectedIndexers.length; i++) {
                assertEq(
                    theGraphDelegationExternalPosition.isDelegatorTo({_indexer: expectedIndexers[i]}),
                    true,
                    "Incorrect delegator status"
                );
            }
        }

        {
            // If we redelegate, value should be unchanged, except that the fees have been charged twice.
            address[] memory expectedManagedAssets =
                _withdrawAll && !_redelegate ? new address[](0) : toArray(address(grtToken));

            uint256[] memory expectedManagedAssetAmounts;

            uint256 initialDelegationValue = delegationAmount - delegationFeeAmount - withdrawalGrtValue;
            uint256 redelegationValue;

            if (_redelegate) {
                uint256 redelegationAmount = withdrawalGrtValue;
                uint256 redelegationFeeAmount =
                    redelegationAmount * theGraphStaking.delegationTaxPercentage() / (BPS_ONE_HUNDRED_PERCENT * 100);

                redelegationValue = redelegationAmount - redelegationFeeAmount;
            }

            expectedManagedAssetAmounts = expectedManagedAssets.length == 0
                ? new uint256[](0)
                : toArray(initialDelegationValue + redelegationValue);

            (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
                theGraphDelegationExternalPosition.getManagedAssets();

            assertEq(managedAssets, expectedManagedAssets, "Incorrect managed assets");
            assertEq(
                managedAssetAmounts.length, expectedManagedAssetAmounts.length, "Incorrect managed asset amounts length"
            );
            if (expectedManagedAssetAmounts.length > 0) {
                assertApproxEqAbs(
                    managedAssetAmounts[0], expectedManagedAssetAmounts[0], 3, "Incorrect managed asset amounts"
                );
            }
        }

        if (_redelegate) {
            // Fund GRT balance should not have changed
            assertEq(postWithdrawalFundGrtBalance, preWithdrawalFundGrtBalance, "Incorrect grt balance");
        } else {
            // Withdrawal amount should have been sent to the fund
            assertEq(
                postWithdrawalFundGrtBalance, preWithdrawalFundGrtBalance + withdrawalGrtValue, "Incorrect grt balance"
            );
        }
    }

    function test_withdraw_successFull() public {
        __test_withdraw({_redelegate: false, _withdrawAll: true});
    }

    function test_withdraw_successPartial() public {
        __test_withdraw({_redelegate: false, _withdrawAll: false});
    }

    function test_redelegate_successFull() public {
        __test_withdraw({_redelegate: true, _withdrawAll: true});
    }

    function test_redelegate_successPartial() public {
        __test_withdraw({_redelegate: true, _withdrawAll: false});
    }
}

abstract contract TheGraphDelegationTestEthereumBase is TheGraphDelegationTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ETHEREUM_CHAIN_ID,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE_THE_GRAPH,
            _version: _version,
            _theGraphControllerAddress: ETHEREUM_THE_GRAPH_CONTROLLER,
            _indexerAddresses: toArray(ETHEREUM_THE_GRAPH_INDEXER_1, ETHEREUM_THE_GRAPH_INDEXER_2)
        });
    }
}

contract TheGraphDelegationTestEthereum is TheGraphDelegationTestEthereumBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current});
    }
}

contract TheGraphDelegationTestEthereumV4 is TheGraphDelegationTestEthereumBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4});
    }
}

abstract contract TheGraphDelegationTestArbitrumBase is TheGraphDelegationTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ARBITRUM_CHAIN_ID,
            _forkBlock: ARBITRUM_BLOCK_LATEST,
            _version: _version,
            _theGraphControllerAddress: ARBITRUM_THE_GRAPH_CONTROLLER,
            _indexerAddresses: toArray(ARBITRUM_THE_GRAPH_INDEXER_1, ARBITRUM_THE_GRAPH_INDEXER_2)
        });
    }
}

contract TheGraphDelegationTestArbitrum is TheGraphDelegationTestArbitrumBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current});
    }
}

contract TheGraphDelegationTestArbitrumV4 is TheGraphDelegationTestArbitrumBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4});
    }
}

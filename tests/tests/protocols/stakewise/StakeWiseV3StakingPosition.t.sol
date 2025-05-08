// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";
import {IStakeWiseV3StakingPosition as IStakeWiseV3StakingPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/stakewise-v3-staking/IStakeWiseV3StakingPosition.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IStakeWiseV3EthVault} from "tests/interfaces/external/IStakeWiseV3EthVault.sol";
import {IStakeWiseV3KeeperRewards} from "tests/interfaces/external/IStakeWiseV3KeeperRewards.sol";
import {IStakeWiseV3OsTokenController} from "tests/interfaces/external/IStakeWiseV3OsTokenController.sol";
import {IStakeWiseV3StakingPositionLib} from "tests/interfaces/internal/IStakeWiseV3StakingPositionLib.sol";
import {IStakeWiseV3StakingPositionParser} from "tests/interfaces/internal/IStakeWiseV3StakingPositionParser.sol";

// ETHEREUM MAINNET CONSTANTS

address constant STAKEWISE_V3_VAULT_REGISTRY_ETHEREUM_ADDRESS = 0x3a0008a588772446f6e656133C2D5029CC4FC20E;
address constant STAKEWISE_V3_KEEPER_ETHEREUM_ADDRESS = 0x6B5815467da09DaA7DC83Db21c9239d98Bb487b5;
address constant STAKEWISE_V3_OS_TOKEN_CONTROLLER_ADDRESS = 0x2A261e60FB14586B474C208b1B7AC6D0f5000306;

// Chorus One Vault - EthVault v3 implementation
address constant STAKEWISE_V3_ETH_VAULT_ETHEREUM_ADDRESS = 0xe6d8d8aC54461b1C5eD15740EEe322043F696C08;
// Genesis Vault - EthGenesisVault v4 implementation
address constant STAKEWISE_V3_ETH_GENESIS_VAULT_ETHEREUM_ADDRESS = 0xAC0F906E433d58FA868F936E8A43230473652885;
address constant STAKEWISE_V3_STAKEWISE_VAULT_NO_VALIDATORS = 0x7f42ABE2353c09393D58E0240750C56F6acBA206;

address constant STAKEWISE_ETH_VAULT_V3_IMPLEMENTATION = 0x9747e1fF73f1759217AFD212Dd36d21360D0880A;
address constant STAKEWISE_ETH_VAULT_V4_IMPLEMENTATION = 0xDecb606ee9140f229Df78F9E40041EAD61610F8f;
address constant STAKEWISE_ETH_GENESIS_VAULT_V4_IMPLEMENTATION = 0x9481A47c5650A868839c6511f0Eef8bF962FABD7;

abstract contract StakeWiseV3StakingPositionTest is IntegrationTest {
    uint256 constant EXITING_ASSETS_CLAIM_DELAY = SECONDS_ONE_DAY;

    event ExitRequestAdded(
        address indexed stakeWiseVaultAddress, uint256 positionTicket, uint256 timestamp, uint256 sharesAmount
    );

    event ExitRequestRemoved(address indexed stakeWiseVaultAddress, uint256 positionTicket);

    event VaultTokenAdded(address indexed stakeWiseVaultAddress);

    event VaultTokenRemoved(address indexed stakeWiseVaultAddress);

    event ExitQueueEntered(address indexed owner, address indexed receiver, uint256 positionTicket, uint256 shares);

    IStakeWiseV3StakingPositionParser internal stakeWiseV3StakingPositionParser;
    IStakeWiseV3StakingPositionLib internal stakeWiseV3StakingPositionLib;
    IStakeWiseV3StakingPositionLib internal stakeWiseV3ExternalPosition;
    uint256 internal stakeWiseV3StakingTypeId;
    address internal stakeWiseV3RegistryAddress;
    IStakeWiseV3KeeperRewards internal stakeWiseV3Keeper;
    IStakeWiseV3OsTokenController stakeWiseV3OsTokenController;
    IStakeWiseV3EthVault internal stakeWiseVault;

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;
    IExternalPositionManager internal externalPositionManager;
    address[] internal supportedImplementations;
    uint256 internal supportedImplementationsListID;

    // Set by child contract
    EnzymeVersion internal version;

    function setUp() public virtual override {
        externalPositionManager = IExternalPositionManager(getExternalPositionManagerAddressForVersion(version));
        (stakeWiseV3StakingPositionLib, stakeWiseV3StakingPositionParser, stakeWiseV3StakingTypeId) =
        deployStakeWiseV3Staking({
            _stakeWiseVaultsRegistryAddress: stakeWiseV3RegistryAddress,
            _wethAddress: address(wethToken)
        });

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        increaseTokenBalance({_token: wethToken, _to: vaultProxyAddress, _amount: 10_000 ether});

        vm.prank(fundOwner);
        stakeWiseV3ExternalPosition = IStakeWiseV3StakingPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: stakeWiseV3StakingTypeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS

    function deployStakeWiseV3Staking(address _stakeWiseVaultsRegistryAddress, address _wethAddress)
        public
        returns (
            IStakeWiseV3StakingPositionLib stakeWiseV3StakingPositionLib_,
            IStakeWiseV3StakingPositionParser stakeWiseV3StakingPositionParser_,
            uint256 typeId_
        )
    {
        // Create a new AddressListRegistry list containing the supported implementations
        supportedImplementationsListID = core.persistent.addressListRegistry.createList({
            _owner: makeAddr("ListOwner"),
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
            _initialItems: supportedImplementations
        });

        stakeWiseV3StakingPositionLib_ = deployStakeWiseV3StakingPositionLib({
            _wethAddress: _wethAddress,
            _referrer: makeAddr("Referrer"),
            _addressListRegistry: address(core.persistent.addressListRegistry),
            _supportedImplementationsListID: supportedImplementationsListID
        });
        stakeWiseV3StakingPositionParser_ = deployStakeWiseV3StakingPositionParser({
            _stakeWiseVaultsRegistryAddress: _stakeWiseVaultsRegistryAddress,
            _wethAddress: _wethAddress
        });

        uint256 typeId = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "STAKEWISE_V3_STAKING",
            _lib: address(stakeWiseV3StakingPositionLib_),
            _parser: address(stakeWiseV3StakingPositionParser_)
        });

        return (stakeWiseV3StakingPositionLib_, stakeWiseV3StakingPositionParser_, typeId);
    }

    function deployStakeWiseV3StakingPositionLib(
        address _wethAddress,
        address _referrer,
        address _addressListRegistry,
        uint256 _supportedImplementationsListID
    ) public returns (IStakeWiseV3StakingPositionLib) {
        bytes memory args = abi.encode(_wethAddress, _referrer, _addressListRegistry, _supportedImplementationsListID);
        address addr = deployCode("StakeWiseV3StakingPositionLib.sol", args);
        return IStakeWiseV3StakingPositionLib(addr);
    }

    function deployStakeWiseV3StakingPositionParser(address _stakeWiseVaultsRegistryAddress, address _wethAddress)
        public
        returns (IStakeWiseV3StakingPositionParser)
    {
        bytes memory args = abi.encode(_stakeWiseVaultsRegistryAddress, _wethAddress);
        address addr = deployCode("StakeWiseV3StakingPositionParser.sol", args);
        return IStakeWiseV3StakingPositionParser(addr);
    }

    // ACTION HELPERS

    function __stake(IStakeWiseV3EthVault _stakeWiseVault, uint256 _assetAmount) private {
        bytes memory actionArgs = abi.encode(_stakeWiseVault, _assetAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(IStakeWiseV3StakingPositionProd.Actions.Stake),
            _actionArgs: actionArgs
        });
    }

    // Note: A StakeWiseV3 vault needs to have registered validators to allow requesting an exit
    function __enterExitQueue(IStakeWiseV3EthVault _stakeWiseVault, uint256 _sharesAmount)
        private
        returns (uint256 positionTicket_, uint256 timestamp_)
    {
        bytes memory actionArgs = abi.encode(_stakeWiseVault, _sharesAmount);

        vm.prank(fundOwner);

        // Need to ensure that stakewisevault is collateralized
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(IStakeWiseV3StakingPositionProd.Actions.EnterExitQueue),
            _actionArgs: actionArgs
        });

        // Retrieve the position counter from the last exit request
        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        // If enterExitQueue results in instant redemption, there will be no exitRequest in storage
        if (exitRequests.length > 0) {
            positionTicket_ = exitRequests[exitRequests.length - 1].positionTicket;
            timestamp_ = exitRequests[exitRequests.length - 1].timestamp;
        }
    }

    function __claimExitedAssets(IStakeWiseV3EthVault _stakeWiseVault, uint256 _positionTicket, uint256 _timestamp)
        private
    {
        bytes memory actionArgs = abi.encode(_stakeWiseVault, _positionTicket, _timestamp);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(IStakeWiseV3StakingPositionProd.Actions.ClaimExitedAssets),
            _actionArgs: actionArgs
        });
    }

    function _getVaultRewards(address vault, int160 newTotalReward, uint160 newUnlockedMevReward)
        private
        pure
        returns (int160, uint160)
    {
        // These come from actual values from https://graphs.stakewise.io/mainnet/subgraphs/name/stakewise/prod/graphql
        if (vault == STAKEWISE_V3_ETH_GENESIS_VAULT_ETHEREUM_ADDRESS) {
            // Genesis Vault
            newTotalReward += 12081819477537065788690;
            newUnlockedMevReward += 700320954200763229157;
        } else if (vault == STAKEWISE_V3_ETH_VAULT_ETHEREUM_ADDRESS) {
            newTotalReward += 736940809604000000000;
        }

        return (newTotalReward, newUnlockedMevReward);
    }

    address private _oracle;
    uint256 internal _oraclePrivateKey;
    uint256 private _validatorsMinOraclesBefore;
    uint256 private _rewardsMinOraclesBefore;

    function _startOracleImpersonate() internal {
        if (_oracle != address(0)) return;

        _validatorsMinOraclesBefore = stakeWiseV3Keeper.validatorsMinOracles();
        _rewardsMinOraclesBefore = stakeWiseV3Keeper.rewardsMinOracles();

        (_oracle, _oraclePrivateKey) = makeAddrAndKey("oracle");
        vm.startPrank(stakeWiseV3Keeper.owner());
        stakeWiseV3Keeper.setValidatorsMinOracles(1);
        stakeWiseV3Keeper.setRewardsMinOracles(1);
        stakeWiseV3Keeper.addOracle(_oracle);
        vm.stopPrank();
    }

    function _stopOracleImpersonate() internal {
        if (_oracle == address(0)) return;
        vm.startPrank(stakeWiseV3Keeper.owner());
        stakeWiseV3Keeper.setValidatorsMinOracles(_validatorsMinOraclesBefore);
        stakeWiseV3Keeper.setRewardsMinOracles(_rewardsMinOraclesBefore);
        stakeWiseV3Keeper.removeOracle(_oracle);
        vm.stopPrank();

        _oracle = address(0);
        _oraclePrivateKey = 0;
        _validatorsMinOraclesBefore = 0;
        _rewardsMinOraclesBefore = 0;
    }

    function toTypedDataHash(bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes32 digest) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, hex"1901")
            mstore(add(ptr, 0x02), domainSeparator)
            mstore(add(ptr, 0x22), structHash)
            digest := keccak256(ptr, 0x42)
        }
    }

    function _hashKeeperTypedData(address keeper, bytes32 structHash) internal view returns (bytes32) {
        return toTypedDataHash(
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256(bytes("KeeperOracles")),
                    keccak256(bytes("1")),
                    block.chainid,
                    keeper
                )
            ),
            structHash
        );
    }

    function _setVaultReward(address _vault, int160 _totalReward, uint160 _unlockedMevReward)
        internal
        returns (IStakeWiseV3EthVault.HarvestParams memory harvestParams)
    {
        // setup oracle
        _startOracleImpersonate();

        bytes32 rewardsRoot = keccak256(bytes.concat(keccak256(abi.encode(_vault, _totalReward, _unlockedMevReward))));

        uint256 avgRewardPerSecond = stakeWiseV3OsTokenController.avgRewardPerSecond();
        uint64 updateTimestamp = uint64(block.timestamp);
        string memory ipfsHash = "rewardsIpfsHash";
        uint256 rewardsNonce = stakeWiseV3Keeper.rewardsNonce();
        bytes32 digest = _hashKeeperTypedData(
            address(stakeWiseV3Keeper),
            keccak256(
                abi.encode(
                    keccak256(
                        "KeeperRewards(bytes32 rewardsRoot,string rewardsIpfsHash,uint256 avgRewardPerSecond,uint64 updateTimestamp,uint64 nonce)"
                    ),
                    rewardsRoot,
                    keccak256(bytes(ipfsHash)),
                    avgRewardPerSecond,
                    updateTimestamp,
                    rewardsNonce
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_oraclePrivateKey, digest);

        // push down the stack
        IStakeWiseV3KeeperRewards.RewardsUpdateParams memory updateParams = IStakeWiseV3KeeperRewards
            .RewardsUpdateParams({
            rewardsRoot: rewardsRoot,
            rewardsIpfsHash: ipfsHash,
            avgRewardPerSecond: avgRewardPerSecond,
            updateTimestamp: updateTimestamp,
            signatures: abi.encodePacked(r, s, v)
        });

        vm.warp(block.timestamp + stakeWiseV3Keeper.rewardsDelay() + 1);
        stakeWiseV3Keeper.updateRewards(updateParams);

        _stopOracleImpersonate();

        bytes32[] memory proof = new bytes32[](0);
        return IStakeWiseV3EthVault.HarvestParams({
            rewardsRoot: rewardsRoot,
            reward: _totalReward,
            unlockedMevReward: _unlockedMevReward,
            proof: proof
        });
    }

    function _setEthVaultReward(address _vault, int160 _totalReward, uint160 _unlockedMevReward)
        internal
        returns (IStakeWiseV3EthVault.HarvestParams memory)
    {
        (_totalReward, _unlockedMevReward) = _getVaultRewards(_vault, _totalReward, _unlockedMevReward);
        return _setVaultReward({_vault: _vault, _totalReward: _totalReward, _unlockedMevReward: _unlockedMevReward});
    }

    function __updateRewardsAndState(IStakeWiseV3EthVault _stakeWiseVault) private {
        IStakeWiseV3EthVault.HarvestParams memory params =
            _setEthVaultReward({_vault: address(_stakeWiseVault), _totalReward: 0, _unlockedMevReward: 0});

        vm.warp(block.timestamp + stakeWiseV3Keeper.rewardsDelay());
        _stakeWiseVault.updateState(params);
    }

    function test_stake_success() public {
        uint256 amount = 7 ether;

        uint256 expectedStakeWiseV3VaultShares = stakeWiseVault.convertToShares({_assets: amount});
        uint256 wethVaultBalancePre = wethToken.balanceOf(vaultProxyAddress);

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit VaultTokenAdded(address(stakeWiseVault));

        vm.recordLogs();

        __stake({_stakeWiseVault: stakeWiseVault, _assetAmount: amount});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: new address[](0)
        });

        uint256 wethVaulBalancePost = wethToken.balanceOf(vaultProxyAddress);
        uint256 stakeWiseVaultExternalPositionBalance = stakeWiseVault.getShares(address(stakeWiseV3ExternalPosition));

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        // Assert that the vault weth balance has been reduced
        assertEq(wethVaultBalancePre - wethVaulBalancePost, amount, "Incorrect vault weth balance");

        // Assert that the external position has the correct amount of shares.
        assertApproxEqAbs(
            stakeWiseVaultExternalPositionBalance,
            expectedStakeWiseV3VaultShares,
            1,
            "Incorrect external position stakeWiseV3 vault shares"
        );

        assertEq(assets, toArray(address(wethToken)), "Incorrect managed assets");
        assertApproxEqAbs(amounts[0], amount, 1, "Incorrect managed asset amounts");

        // Check that the stakewise vault has been added to storage
        assertEq(
            stakeWiseV3ExternalPosition.getStakeWiseVaultTokens(),
            toArray(address(stakeWiseVault)),
            "StakeWise vault token missing from storage"
        );
    }

    function __test_enterExitQueue_success(bool _exitAll) private {
        __stake({_stakeWiseVault: stakeWiseVault, _assetAmount: 7 ether});

        uint256 sharesBalance = stakeWiseVault.getShares(address(stakeWiseV3ExternalPosition));
        uint256 sharesToExit = _exitAll ? sharesBalance : sharesBalance / 3;

        // Don't validate the positionTicket as we don't know it yet.
        vm.expectEmit(true, false, true, false, address(stakeWiseV3ExternalPosition));
        emit ExitRequestAdded(address(stakeWiseVault), 0, block.timestamp, sharesToExit);

        if (_exitAll) {
            expectEmit(address(stakeWiseV3ExternalPosition));
            emit VaultTokenRemoved(address(stakeWiseVault));
        }

        vm.recordLogs();

        (uint256 positionTicket,) = __enterExitQueue({_stakeWiseVault: stakeWiseVault, _sharesAmount: sharesToExit});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            // The wethIncoming has been added to handle case where entering the exit queue redeems instantly
            _assets: toArray(address(wethToken))
        });

        address expectedAsset = address(wethToken);
        // Valuation should still equal initial balance (pending exit + remaining balance)
        uint256 expectedAssetAmount = stakeWiseVault.convertToAssets(sharesBalance);

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(expectedAsset), "Incorrect managed assets");
        assertApproxEqAbs(amounts[0], expectedAssetAmount, 1, "Incorrect managed asset amounts");

        if (_exitAll) {
            assertEq(
                stakeWiseV3ExternalPosition.getStakeWiseVaultTokens().length, 0, "StakeWise vault still in storage"
            );
        } else {
            assertEq(
                stakeWiseV3ExternalPosition.getStakeWiseVaultTokens().length, 1, "StakeWise vault missing from storage"
            );
        }

        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        assertEq(exitRequests.length, 1, "ExitRequest not found in storage");
        assertEq(
            exitRequests[0].stakeWiseVaultAddress, address(stakeWiseVault), "stakeWiseVaultAddress exitRequest mismatch"
        );
        assertEq(exitRequests[0].positionTicket, positionTicket, "positionTicket exitRequest mismatch");
        assertEq(exitRequests[0].timestamp, block.timestamp, "timestamp exitRequest mismatch");
        assertEq(exitRequests[0].sharesAmount, sharesToExit, "amount exitRequest mismatch");
    }

    function test_enterExitQueue_successWithImmediateRedemption() public {
        // StakeWise vault with no validators (to allow immediate redemptions)
        IStakeWiseV3EthVault stakeWiseVaultNoValidators =
            IStakeWiseV3EthVault(STAKEWISE_V3_STAKEWISE_VAULT_NO_VALIDATORS);
        __stake({_stakeWiseVault: stakeWiseVaultNoValidators, _assetAmount: 7 ether});

        uint256 sharesToExit = stakeWiseVaultNoValidators.getShares(address(stakeWiseV3ExternalPosition));

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit VaultTokenRemoved(address(stakeWiseVaultNoValidators));

        vm.recordLogs();

        uint256 wethBalancePreExit = wethToken.balanceOf(vaultProxyAddress);

        __enterExitQueue({_stakeWiseVault: stakeWiseVaultNoValidators, _sharesAmount: sharesToExit});

        uint256 wethBalancePostExit = wethToken.balanceOf(vaultProxyAddress);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        // Funds should be returned to the vault
        assertEq(
            wethBalancePostExit - wethBalancePreExit,
            stakeWiseVaultNoValidators.convertToAssets({_shares: sharesToExit}),
            "Incorrect vault weth balance"
        );

        (address[] memory assets,) = stakeWiseV3ExternalPosition.getManagedAssets();

        // There should be no assets in the external position since the only position has been redeemed in full
        assertEq(assets.length, 0, "Incorrect managed assets");
        assertEq(stakeWiseV3ExternalPosition.getStakeWiseVaultTokens().length, 0, "StakeWise vault still in storage");
        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();
        assertEq(exitRequests.length, 0, "ExitRequest incorrectly found in storage");
    }

    function test_enterExitQueue_successWithFullSharesAmount() public {
        __test_enterExitQueue_success({_exitAll: true});
    }

    function test_enterExitQueue_successWithPartialSharesAmount() public {
        __test_enterExitQueue_success({_exitAll: false});
    }

    function __test_claimExitedAssets_success(bool _fullyClaimable) private {
        __stake({_stakeWiseVault: stakeWiseVault, _assetAmount: 7 ether});

        uint256 sharesBalance = stakeWiseVault.getShares(address(stakeWiseV3ExternalPosition));

        (uint256 positionTicket, uint256 timestamp) =
            __enterExitQueue({_stakeWiseVault: stakeWiseVault, _sharesAmount: sharesBalance});

        uint256 queuedShares = uint256(stakeWiseVault.queuedShares());
        uint256 totalExitingAssets_ = uint256(stakeWiseVault.totalExitingAssets());
        uint256 minimalAssetsRequired = stakeWiseVault.convertToAssets({_shares: sharesBalance + queuedShares})
            + totalExitingAssets_ + address(stakeWiseVault).balance;
        // Adjust the Ether balance of the StakeWise vault so it either fulfills a full or partial claim
        if (!_fullyClaimable) {
            if (address(stakeWiseVault) == STAKEWISE_V3_ETH_GENESIS_VAULT_ETHEREUM_ADDRESS) {
                vm.deal(address(stakeWiseVault), minimalAssetsRequired - 25 ether);
            } else if (address(stakeWiseVault) == STAKEWISE_V3_ETH_VAULT_ETHEREUM_ADDRESS) {
                vm.deal(address(stakeWiseVault), minimalAssetsRequired * 99 / 100);
            }
        } else {
            // Make sure that the vault has enough balance to fulfill the exit request
            vm.deal(address(stakeWiseVault), minimalAssetsRequired);
        }

        __updateRewardsAndState({_stakeWiseVault: stakeWiseVault});

        int256 exitQueueIndex = stakeWiseVault.getExitQueueIndex({_positionTicket: positionTicket});

        assertGe(exitQueueIndex, 0, "__claimExitedAssets: ExitQueueIndex should be >= 0");

        // Calculate expected remainingShares, and expected assets to receive
        (uint256 remainingShares,, uint256 claimedAssets) = stakeWiseVault.calculateExitedAssets({
            _receiver: address(stakeWiseV3ExternalPosition),
            _positionTicket: positionTicket,
            _timestamp: timestamp,
            _exitQueueIndex: uint256(exitQueueIndex)
        });

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit ExitRequestRemoved(address(stakeWiseVault), positionTicket);

        uint256 vaultWethBalancePreClaim = wethToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __claimExitedAssets({_stakeWiseVault: stakeWiseVault, _positionTicket: positionTicket, _timestamp: timestamp});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        uint256 vaultWethBalancePostClaim = wethToken.balanceOf(vaultProxyAddress);

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        if (_fullyClaimable) {
            assertEq(assets.length, 0, "Incorrect managed assets");
            assertEq(amounts.length, 0, "Incorrect managed asset amounts");

            // Check that the exit request has been removed from storage
            assertEq(stakeWiseV3ExternalPosition.getExitRequests().length, 0, "ExitRequest still in storage");
        } else {
            assertEq(assets, toArray(address(wethToken)), "Incorrect managed assets");
            // Valuation should be the leftover unclaimed shares. Small buffer to account for rewards value increase.
            assertEq(
                amounts[0], stakeWiseVault.convertToAssets({_shares: remainingShares}), "Incorrect managed asset amount"
            );

            // Check that the previous exit request has been removed from storage, and a new one added
            IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests =
                stakeWiseV3ExternalPosition.getExitRequests();

            assertEq(exitRequests.length, 1, "ExitRequest missing from storage");
            assertEq(
                exitRequests[0].stakeWiseVaultAddress,
                address(stakeWiseVault),
                "Wrong stakeWiseVaultAddress in exitRequest"
            );
            assertNotEq(exitRequests[0].positionTicket, positionTicket, "Position ticket not updated");
            assertEq(exitRequests[0].timestamp, timestamp, "Incorrect ExitRequest timestamp");
            assertEq(exitRequests[0].sharesAmount, remainingShares, "Incorrect ExitRequest sharesAmount");
        }

        // Make sure that the weth has been returned to the vault. Small buffer due to increase in weth balance from rewards
        assertEq(vaultWethBalancePostClaim, vaultWethBalancePreClaim + claimedAssets, "Incorrect vault weth balance");
    }

    function test_claimExitedAssets_successWithFullClaim() public {
        __test_claimExitedAssets_success({_fullyClaimable: true});
    }

    function test_claimExitedAssets_successWithPartialClaim() public {
        __test_claimExitedAssets_success({_fullyClaimable: false});
    }

    function test_getManagedAssets_failsWithUnregisteredImplementation() public {
        __stake({_stakeWiseVault: stakeWiseVault, _assetAmount: 7 ether});

        vm.prank(makeAddr("ListOwner"));
        // Update the supported implementations list to remove all the implementations
        core.persistent.addressListRegistry.removeFromList({
            _id: supportedImplementationsListID,
            _items: supportedImplementations
        });

        vm.expectRevert("__validateStakeWiseVault: Unregistered implementation");
        stakeWiseV3ExternalPosition.getManagedAssets();
    }
}

abstract contract StakeWiseTestEthereum is StakeWiseV3StakingPositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TIME_SENSITIVE_STAKEWISE);

        stakeWiseV3Keeper = IStakeWiseV3KeeperRewards(STAKEWISE_V3_KEEPER_ETHEREUM_ADDRESS);
        stakeWiseV3OsTokenController = IStakeWiseV3OsTokenController(STAKEWISE_V3_OS_TOKEN_CONTROLLER_ADDRESS);
        stakeWiseV3RegistryAddress = STAKEWISE_V3_VAULT_REGISTRY_ETHEREUM_ADDRESS;
        supportedImplementations = toArray(
            STAKEWISE_ETH_VAULT_V3_IMPLEMENTATION,
            STAKEWISE_ETH_VAULT_V4_IMPLEMENTATION,
            STAKEWISE_ETH_GENESIS_VAULT_V4_IMPLEMENTATION
        );

        super.setUp();
    }
}

contract StakeWiseTestEthereumEthVault is StakeWiseTestEthereum {
    function setUp() public virtual override {
        stakeWiseVault = IStakeWiseV3EthVault(STAKEWISE_V3_ETH_VAULT_ETHEREUM_ADDRESS);

        super.setUp();
    }
}

contract StakeWiseTestEthereumV4EthVault is StakeWiseTestEthereumEthVault {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

contract StakeWiseTestEthereumGenesisVault is StakeWiseTestEthereum {
    function setUp() public virtual override {
        stakeWiseVault = IStakeWiseV3EthVault(STAKEWISE_V3_ETH_GENESIS_VAULT_ETHEREUM_ADDRESS);

        super.setUp();
    }
}

contract StakeWiseTestEthereumVGenesisVault is StakeWiseTestEthereumGenesisVault {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

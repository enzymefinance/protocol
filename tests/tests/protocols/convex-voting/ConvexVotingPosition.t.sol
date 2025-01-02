// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Vm} from "forge-std/Vm.sol";

import {IConvexVotingPosition as IConvexVotingPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/convex-voting/IConvexVotingPosition.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IConvexBaseRewardPool} from "tests/interfaces/external/IConvexBaseRewardPool.sol";
import {IConvexCvxLockerV2} from "tests/interfaces/external/IConvexCvxLockerV2.sol";
import {IConvexVlCvxExtraRewardDistribution} from "tests/interfaces/external/IConvexVlCvxExtraRewardDistribution.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ISnapshotDelegateRegistry} from "tests/interfaces/external/ISnapshotDelegateRegistry.sol";
import {IVotiumMultiMerkleStash} from "tests/interfaces/external/IVotiumMultiMerkleStash.sol";

import {IConvexVotingPositionLib} from "tests/interfaces/internal/IConvexVotingPositionLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";

import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";

address constant ETHEREUM_CVX_CRV_STAKING_CONTRACT = 0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e;
address constant ETHEREUM_CVX_TOKEN_CONTRACT = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
address constant ETHEREUM_SNAPSHOT_DELEGATE_REGISTRY = 0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446;
address constant ETHEREUM_VLCVX_CONTRACT = 0x72a19342e8F1838460eBFCCEf09F6585e32db86E;
address constant ETHEREUM_VLCVX_EXTRA_REWARDS_CONTRACT = 0x9B622f2c40b80EF5efb14c2B2239511FfBFaB702;
address constant ETHEREUM_VOTIUM_MULTI_MERKLE_STASH_CONTRACT = 0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A;
address constant ETHEREUM_CVX_CRV = 0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7;
bytes32 constant CONVEX_SNAPSHOT_ID = "cvx.eth";

////////////////
// TEST BASES //
////////////////

abstract contract TestBase is IntegrationTest {
    using AddressArrayLib for address[];

    event RequestAdded(uint256 indexed id, uint256 amount);

    event RequestRemoved(uint256 indexed id);

    IConvexVotingPositionLib internal convexVotingPosition;

    address internal fundOwner;
    address internal comptrollerProxyAddress;
    address internal vaultProxyAddress;

    EnzymeVersion internal version;

    function __initialize(EnzymeVersion _version) internal {
        version = _version;

        setUpMainnetEnvironment();

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Deploy all position dependencies
        uint256 typeId = __deployPositionType({
            _vlCvx: ETHEREUM_VLCVX_CONTRACT,
            _vlCvxExtraRewards: ETHEREUM_VLCVX_EXTRA_REWARDS_CONTRACT,
            _cvxCrvStaking: ETHEREUM_CVX_CRV_STAKING_CONTRACT,
            _cvxToken: ETHEREUM_CVX_TOKEN_CONTRACT,
            _snapshotDelegateRegistry: ETHEREUM_SNAPSHOT_DELEGATE_REGISTRY,
            _votiumMultiMerkleStash: ETHEREUM_VOTIUM_MULTI_MERKLE_STASH_CONTRACT
        });

        vm.prank(fundOwner);
        convexVotingPosition = IConvexVotingPositionLib(
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
        address _vlCvx,
        address _vlCvxExtraRewards,
        address _cvxCrvStaking,
        address _cvxToken,
        address _snapshotDelegateRegistry,
        address _votiumMultiMerkleStash
    ) internal returns (address libAddress_) {
        bytes memory args = abi.encode(
            _vlCvx, _vlCvxExtraRewards, _cvxCrvStaking, _cvxToken, _snapshotDelegateRegistry, _votiumMultiMerkleStash
        );

        return deployCode("ConvexVotingPositionLib.sol", args);
    }

    function __deployParser(address _cvxToken) internal returns (address parserAddress_) {
        bytes memory args = abi.encode(_cvxToken);

        return deployCode("ConvexVotingPositionParser.sol", args);
    }

    function __deployPositionType(
        address _vlCvx,
        address _vlCvxExtraRewards,
        address _cvxCrvStaking,
        address _cvxToken,
        address _snapshotDelegateRegistry,
        address _votiumMultiMerkleStash
    ) internal returns (uint256 typeId_) {
        // Deploy position contracts
        address libAddress = __deployLib({
            _vlCvx: _vlCvx,
            _vlCvxExtraRewards: _vlCvxExtraRewards,
            _cvxCrvStaking: _cvxCrvStaking,
            _cvxToken: _cvxToken,
            _snapshotDelegateRegistry: _snapshotDelegateRegistry,
            _votiumMultiMerkleStash: _votiumMultiMerkleStash
        });

        address parserAddress = __deployParser(_cvxToken);

        // Register position type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "CONVEX_VOTING",
            _lib: libAddress,
            _parser: parserAddress
        });

        return typeId_;
    }

    // ACTION HELPERS

    function __lock(uint256 _amount, uint256 _spendRatio) internal {
        bytes memory actionArgs = abi.encode(_amount, _spendRatio);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(convexVotingPosition),
            _actionId: uint256(IConvexVotingPositionProd.Actions.Lock),
            _actionArgs: actionArgs
        });
    }

    function __relock() internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(convexVotingPosition),
            _actionId: uint256(IConvexVotingPositionProd.Actions.Relock),
            _actionArgs: ""
        });
    }

    function __withdraw() internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(convexVotingPosition),
            _actionId: uint256(IConvexVotingPositionProd.Actions.Withdraw),
            _actionArgs: ""
        });
    }

    function __delegate(address _delegatee) internal {
        bytes memory actionArgs = abi.encode(_delegatee);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(convexVotingPosition),
            _actionId: uint256(IConvexVotingPositionProd.Actions.Delegate),
            _actionArgs: actionArgs
        });
    }

    function __claimRewards(
        address[] memory _allTokensToTransfer,
        bool _claimLockerRewards,
        address[] memory _extraRewardTokens,
        IVotiumMultiMerkleStash.ClaimParam[] memory _votiumClaims,
        bool _unstakeCvxCrv
    ) internal {
        bytes memory actionArgs =
            abi.encode(_allTokensToTransfer, _claimLockerRewards, _extraRewardTokens, _votiumClaims, _unstakeCvxCrv);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(convexVotingPosition),
            _actionId: uint256(IConvexVotingPositionProd.Actions.ClaimRewards),
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __lockAmount(uint256 _amountInUnits) internal returns (uint256 lockAmount_) {
        uint256 lockAmount = _amountInUnits * assetUnit(IERC20(ETHEREUM_CVX_TOKEN_CONTRACT));

        increaseTokenBalance({_token: IERC20(ETHEREUM_CVX_TOKEN_CONTRACT), _to: vaultProxyAddress, _amount: lockAmount});

        __lock({_amount: lockAmount, _spendRatio: 0});

        return lockAmount;
    }

    // inspired by https://solidity-by-example.org/app/merkle-tree/
    // works correct only for even number of nodes
    function __generateMerkleTreeRoot(bytes32[] memory _nodes) internal pure returns (bytes32 merkleRoot_) {
        bytes32[] memory hashes = new bytes32[](_nodes.length * 2 - 1);

        uint256 lastElement = 0;

        for (uint256 i = 0; i < _nodes.length; i++) {
            hashes[lastElement] = _nodes[i];
            lastElement++;
        }

        uint256 n = _nodes.length;
        uint256 offset = 0;

        while (n > 0) {
            for (uint256 i = 0; i < n - 1; i += 2) {
                hashes[lastElement] = keccak256(abi.encodePacked(hashes[offset + i], hashes[offset + i + 1]));
                lastElement++;
            }
            offset += n;
            n = n / 2;
        }

        return hashes[hashes.length - 1];
    }

    // TESTS

    function test_lock_success() public {
        uint256 lockAmount = 100 * assetUnit(IERC20(ETHEREUM_CVX_TOKEN_CONTRACT));

        increaseTokenBalance({
            _token: IERC20(ETHEREUM_CVX_TOKEN_CONTRACT),
            _to: vaultProxyAddress,
            _amount: lockAmount * 5 // increase to some larger number than lockAmount so vault won't have 0 cvx amount when locking
        });

        uint256 preLockVaultBalance = IERC20(ETHEREUM_CVX_TOKEN_CONTRACT).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __lock({_amount: lockAmount, _spendRatio: 0});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        (address[] memory managedAssets, uint256[] memory managedAmounts) = convexVotingPosition.getManagedAssets();
        assertEq(managedAssets, toArray(ETHEREUM_CVX_TOKEN_CONTRACT), "Incorrect managedAsset");
        assertEq(managedAmounts, toArray(lockAmount), "Incorrect managedAmount");

        assertEq(
            IERC20(ETHEREUM_CVX_TOKEN_CONTRACT).balanceOf(vaultProxyAddress),
            preLockVaultBalance - lockAmount,
            "Incorrect vault balance"
        );
    }

    function test_relock_success() public {
        uint256 lockAmount = __lockAmount(120);

        (,,, IConvexCvxLockerV2.LockedBalance[] memory lockData) =
            IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).lockedBalances(address(convexVotingPosition));

        vm.warp(lockData[0].unlockTime); // warp to time when lock is unlocked

        (, uint256 preRelockUnlockable,,) =
            IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).lockedBalances(address(convexVotingPosition));

        assertEq(preRelockUnlockable, lockAmount, "Incorrect unlockable amount before relock");

        vm.recordLogs();

        __relock();

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // after relock all of the unlockable amount should be relocked
        (, uint256 postRelockUnlockable,,) =
            IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).lockedBalances(address(convexVotingPosition));
        assertEq(postRelockUnlockable, 0, "Incorrect unlockable amount after relock");

        (address[] memory managedAssets, uint256[] memory managedAmounts) = convexVotingPosition.getManagedAssets();
        assertEq(managedAssets, toArray(ETHEREUM_CVX_TOKEN_CONTRACT), "Incorrect managedAsset");
        assertEq(managedAmounts, toArray(lockAmount), "Incorrect managedAmount");
    }

    function test_withdraw_success() public {
        uint256 lockAmount = __lockAmount(300);

        (,,, IConvexCvxLockerV2.LockedBalance[] memory lockData) =
            IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).lockedBalances(address(convexVotingPosition));

        vm.warp(lockData[0].unlockTime); // warp to time when lock is unlocked

        (, uint256 preWithdrawUnlockable,,) =
            IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).lockedBalances(address(convexVotingPosition));

        assertEq(preWithdrawUnlockable, lockAmount, "Incorrect unlockable amount before withdraw");

        uint256 preWithdrawVaultBalance = IERC20(ETHEREUM_CVX_TOKEN_CONTRACT).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __withdraw();

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(ETHEREUM_CVX_TOKEN_CONTRACT)
        });

        (, uint256 postWithdrawUnlockable,,) =
            IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).lockedBalances(address(convexVotingPosition));
        uint256 postWithdrawVaultBalance = IERC20(ETHEREUM_CVX_TOKEN_CONTRACT).balanceOf(vaultProxyAddress);
        // check that vault balance increased by unlockable amount
        assertEq(
            postWithdrawVaultBalance,
            preWithdrawVaultBalance + preWithdrawUnlockable,
            "Incorrect vault balance after withdraw"
        );
        // check that unlockable amount is 0 after withdraw
        assertEq(postWithdrawUnlockable, 0, "Incorrect unlockable amount after withdraw");

        (address[] memory managedAssets,) = convexVotingPosition.getManagedAssets();
        assertEq(managedAssets.length, 0, "Incorrect managedAssets length");
    }

    function test_delegate_success() public {
        address delegatee = makeAddr("delegatee");

        vm.recordLogs();

        __delegate(delegatee);

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        assertEq(
            ISnapshotDelegateRegistry(ETHEREUM_SNAPSHOT_DELEGATE_REGISTRY).delegation({
                _account: address(convexVotingPosition),
                _snapshotId: CONVEX_SNAPSHOT_ID
            }),
            delegatee,
            "Incorrect delegatee"
        );
    }

    function test_claimRewards_successExtraRewards() public {
        __lockAmount(400);

        uint256 preExtraRewardTokenBalance = wethToken.balanceOf(vaultProxyAddress);

        uint256 rewardsDuration = IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).rewardsDuration(); // single epoch duration

        skip(2 * rewardsDuration); // wait 2 epochs so extra rewards can be added for our lock
        IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).checkpointEpoch(); // update epoch in the locker

        // add extra rewards for all locks
        uint256 extraRewardAmount = 100 * assetUnit(wethToken);
        increaseTokenBalance({_token: wethToken, _to: address(this), _amount: extraRewardAmount});
        wethToken.approve(ETHEREUM_VLCVX_EXTRA_REWARDS_CONTRACT, extraRewardAmount);
        IConvexVlCvxExtraRewardDistribution(ETHEREUM_VLCVX_EXTRA_REWARDS_CONTRACT).addReward(
            address(wethToken), extraRewardAmount
        );

        // wait for rewards to accrue
        skip(rewardsDuration);
        IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).checkpointEpoch();

        vm.recordLogs();

        __claimRewards({
            _allTokensToTransfer: toArray(address(wethToken)),
            _claimLockerRewards: false,
            _extraRewardTokens: toArray(address(wethToken)),
            _votiumClaims: new IVotiumMultiMerkleStash.ClaimParam[](0),
            _unstakeCvxCrv: false
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // check that extra reward token was transferred to the vault
        assertGt(
            wethToken.balanceOf(vaultProxyAddress), preExtraRewardTokenBalance, "Incorrect extra reward token balance"
        );
    }

    function test_claimRewards_successLockerRewards() public {
        __lockAmount(450);

        // get all reward tokens from the locker
        bool success = true;
        uint256 rewardId = 0;
        address[] memory rewardTokens = new address[](0);
        while (success) {
            try IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).rewardTokens(rewardId) returns (address rewardToken) {
                rewardId++;
                rewardTokens = rewardTokens.addItem(rewardToken);
            } catch {
                success = false;
            }
        }
        // check which ones are still active
        address[] memory activeRewardTokens = new address[](0);
        for (uint256 i; i < rewardTokens.length; i++) {
            (, uint40 periodFinish,,,) = IConvexCvxLockerV2(ETHEREUM_VLCVX_CONTRACT).rewardData(rewardTokens[i]);
            if (periodFinish > block.timestamp) {
                activeRewardTokens = activeRewardTokens.addItem(rewardTokens[i]);
            }
        }

        uint256[] memory preRewardTokenBalances = new uint256[](activeRewardTokens.length);
        for (uint256 i; i < activeRewardTokens.length; i++) {
            preRewardTokenBalances[i] = IERC20(activeRewardTokens[i]).balanceOf(vaultProxyAddress);
        }

        // wait for rewards to accrue
        skip(7 days);

        vm.recordLogs();

        __claimRewards({
            _allTokensToTransfer: activeRewardTokens,
            _claimLockerRewards: true,
            _extraRewardTokens: new address[](0),
            _votiumClaims: new IVotiumMultiMerkleStash.ClaimParam[](0),
            _unstakeCvxCrv: false
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // assert that reward token was transferred to the vault
        for (uint256 i; i < activeRewardTokens.length; i++) {
            assertGt(
                IERC20(activeRewardTokens[i]).balanceOf(vaultProxyAddress),
                preRewardTokenBalances[i],
                "Incorrect reward token balance"
            );
        }
    }

    function test_claimRewards_successUnstakeCvxCrv() public {
        // stake some cvxCrv for the external position
        uint256 stakedCvxCrvAmount = 500 * assetUnit(IERC20(ETHEREUM_CVX_CRV));
        increaseTokenBalance({_token: IERC20(ETHEREUM_CVX_CRV), _to: address(this), _amount: stakedCvxCrvAmount});
        IERC20(ETHEREUM_CVX_CRV).approve(ETHEREUM_CVX_CRV_STAKING_CONTRACT, stakedCvxCrvAmount);
        IConvexBaseRewardPool(ETHEREUM_CVX_CRV_STAKING_CONTRACT).stakeFor({
            _for: address(convexVotingPosition),
            _amount: stakedCvxCrvAmount
        });

        uint256 preCvxTokenBalance = IERC20(ETHEREUM_CVX_CRV).balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __claimRewards({
            _allTokensToTransfer: toArray(ETHEREUM_CVX_CRV),
            _claimLockerRewards: false,
            _extraRewardTokens: new address[](0),
            _votiumClaims: new IVotiumMultiMerkleStash.ClaimParam[](0),
            _unstakeCvxCrv: true
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        assertGt(
            IERC20(ETHEREUM_CVX_CRV).balanceOf(vaultProxyAddress), preCvxTokenBalance, "Incorrect cvx token balance"
        );
    }

    function test_claimRewardsVotium_success() public {
        uint256 rewardsAmount = 120 * assetUnit(wethToken);
        uint256 rewardsIndex = 0;

        // nodes of the merkle tree
        bytes32[] memory nodes = new bytes32[](4);
        nodes[0] = keccak256(abi.encodePacked(rewardsIndex, address(convexVotingPosition), rewardsAmount));
        nodes[1] = keccak256(abi.encodePacked(uint256(1), makeAddr("random user 1"), uint256(100)));
        nodes[2] = keccak256(abi.encodePacked(uint256(2), makeAddr("random user 2"), uint256(200)));
        nodes[3] = keccak256(abi.encodePacked(uint256(3), makeAddr("random user 3"), uint256(200)));

        // add rewards to the votium stash
        bytes32 merkleRoot = __generateMerkleTreeRoot(nodes);
        address votiumMerkleStashOwner = IVotiumMultiMerkleStash(ETHEREUM_VOTIUM_MULTI_MERKLE_STASH_CONTRACT).owner();
        vm.prank(votiumMerkleStashOwner);
        IVotiumMultiMerkleStash(ETHEREUM_VOTIUM_MULTI_MERKLE_STASH_CONTRACT).updateMerkleRoot({
            _token: address(wethToken),
            _merkleRoot: merkleRoot
        });
        increaseTokenBalance({
            _token: wethToken,
            _to: ETHEREUM_VOTIUM_MULTI_MERKLE_STASH_CONTRACT,
            _amount: rewardsAmount
        });

        // get merkle proof for node 0
        bytes32[] memory merkleProof = new bytes32[](2);
        merkleProof[0] = nodes[1];
        merkleProof[1] = keccak256(abi.encodePacked(nodes[2], nodes[3]));

        IVotiumMultiMerkleStash.ClaimParam[] memory claims = new IVotiumMultiMerkleStash.ClaimParam[](1);
        claims[0] = IVotiumMultiMerkleStash.ClaimParam({
            token: address(wethToken),
            index: rewardsIndex,
            amount: rewardsAmount,
            merkleProof: merkleProof
        });

        uint256 preRewardTokenBalance = wethToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __claimRewards({
            _allTokensToTransfer: toArray(address(wethToken)),
            _claimLockerRewards: false,
            _extraRewardTokens: new address[](0),
            _votiumClaims: claims,
            _unstakeCvxCrv: false
        });

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // check that reward token was transferred to the vault
        assertEq(
            wethToken.balanceOf(vaultProxyAddress),
            preRewardTokenBalance + rewardsAmount,
            "Incorrect reward token balance"
        );
    }
}

contract ConvexVotingPositionTestEthereum is TestBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ConvexVotingPositionTestEthereumV4 is TestBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

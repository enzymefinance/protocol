// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IStakeWiseV3EthVault} from "tests/interfaces/external/IStakeWiseV3EthVault.sol";
import {IStakeWiseV3StakingPositionLib} from "tests/interfaces/internal/IStakeWiseV3StakingPositionLib.sol";
import {IStakeWiseV3StakingPositionParser} from "tests/interfaces/internal/IStakeWiseV3StakingPositionParser.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

enum Actions {
    Stake,
    Redeem,
    EnterExitQueue,
    ClaimExitedAssets
}

// ETHEREUM MAINNET CONSTANTS
// TODO: Update when StakeWiseV3 deployment is live
address constant STAKEWISE_V3_VAULT_TOKEN_ETHEREUM_ADDRESS = 0x0000000000000000000000000000000000000000;
address constant STAKEWISE_V3_VAULT_REGISTRY_ETHEREUM_ADDRESS = 0x0000000000000000000000000000000000000000;

// GOERLI CONSTANTS
address constant STAKEWISE_V3_VAULT_TOKEN_GOERLI_ADDRESS = 0xeEFFFD4C23D2E8c845870e273861e7d60Df49663;
address constant STAKEWISE_V3_VAULT_REGISTRY_GOERLI_ADDRESS = 0xC42eAc61200fBB317316810aFb70Bf92401b798B;

abstract contract StakeWiseV3StakingPositionTest is IntegrationTest {
    event ExitRequestAdded(address indexed stakeWiseV3VaultAddress, uint256 positionTicket, uint256 shares);

    event ExitRequestRemoved(address indexed stakeWiseV3VaultAddress, uint256 positionTicket);

    event VaultTokenAdded(address indexed stakeWiseV3VaultAddress);

    event VaultTokenRemoved(address indexed stakeWiseV3VaultAddress);

    address internal vaultOwner = makeAddr("VaultOwner");

    IStakeWiseV3StakingPositionParser internal stakeWiseV3StakingPositionParser;
    IStakeWiseV3StakingPositionLib internal stakeWiseV3StakingPositionLib;
    IStakeWiseV3StakingPositionLib internal stakeWiseV3ExternalPosition;
    uint256 internal stakeWiseV3StakingTypeId;
    address internal stakeWiseV3RegistryAddress;
    IStakeWiseV3EthVault internal stakeWiseV3Vault;

    IVaultLib internal vaultProxy;
    IComptrollerLib internal comptrollerProxy;

    function setUp() public virtual override {
        (stakeWiseV3StakingPositionLib, stakeWiseV3StakingPositionParser, stakeWiseV3StakingTypeId) =
        deployStakeWiseV3Staking({
            _stakeWiseV3VaultsRegistryAddress: stakeWiseV3RegistryAddress,
            _wethAddress: address(wethToken),
            _externalPositionManager: core.release.externalPositionManager
        });

        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: vaultOwner,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 10_000 ether,
            _sharesBuyer: vaultOwner
        });

        vm.prank(vaultOwner);

        stakeWiseV3ExternalPosition = IStakeWiseV3StakingPositionLib(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: comptrollerProxy,
                _typeId: stakeWiseV3StakingTypeId,
                _initializationData: "",
                _callOnExternalPositionCallArgs: ""
            })
        );
    }

    // DEPLOYMENT HELPERS

    function deployStakeWiseV3Staking(
        address _stakeWiseV3VaultsRegistryAddress,
        address _wethAddress,
        IExternalPositionManager _externalPositionManager
    )
        public
        returns (
            IStakeWiseV3StakingPositionLib stakeWiseV3StakingPositionLib_,
            IStakeWiseV3StakingPositionParser stakeWiseV3StakingPositionParser_,
            uint256 typeId_
        )
    {
        stakeWiseV3StakingPositionLib_ =
            deployStakeWiseV3StakingPositionLib({_wethAddress: _wethAddress, _referrer: address(0)});
        stakeWiseV3StakingPositionParser_ = deployStakeWiseV3StakingPositionParser({
            _stakeWiseV3VaultsRegistryAddress: _stakeWiseV3VaultsRegistryAddress,
            _wethAddress: _wethAddress
        });

        uint256 typeId = registerExternalPositionType({
            _label: "STAKEWISE_V3_STAKING",
            _lib: address(stakeWiseV3StakingPositionLib_),
            _parser: address(stakeWiseV3StakingPositionParser_),
            _externalPositionManager: _externalPositionManager
        });

        return (stakeWiseV3StakingPositionLib_, stakeWiseV3StakingPositionParser_, typeId);
    }

    function deployStakeWiseV3StakingPositionLib(address _wethAddress, address _referrer)
        public
        returns (IStakeWiseV3StakingPositionLib)
    {
        bytes memory args = abi.encode(_wethAddress, _referrer);
        address addr = deployCode("StakeWiseV3StakingPositionLib.sol", args);
        return IStakeWiseV3StakingPositionLib(addr);
    }

    function deployStakeWiseV3StakingPositionParser(address _stakeWiseV3VaultsRegistryAddress, address _wethAddress)
        public
        returns (IStakeWiseV3StakingPositionParser)
    {
        bytes memory args = abi.encode(_stakeWiseV3VaultsRegistryAddress, _wethAddress);
        address addr = deployCode("StakeWiseV3StakingPositionParser.sol", args);
        return IStakeWiseV3StakingPositionParser(addr);
    }

    // ACTION HELPERS

    function __stake(uint256 _assetAmount) private {
        bytes memory actionArgs = abi.encode(stakeWiseV3Vault, _assetAmount);

        vm.prank(vaultOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(Actions.Stake),
            _actionArgs: actionArgs
        });
    }

    function __redeem(uint256 _sharesAmount) private {
        bytes memory actionArgs = abi.encode(stakeWiseV3Vault, _sharesAmount);

        vm.prank(vaultOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(Actions.Redeem),
            _actionArgs: actionArgs
        });
    }

    function __enterExitQueue(uint256 _sharesAmount) private returns (uint256 positionTicket_) {
        bytes memory actionArgs = abi.encode(stakeWiseV3Vault, _sharesAmount);

        vm.prank(vaultOwner);

        // Need to ensure that stakewisevault is collateralized
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(Actions.EnterExitQueue),
            _actionArgs: actionArgs
        });

        // Retrieve the position counter from the last exit request
        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        positionTicket_ = exitRequests[exitRequests.length - 1].positionTicket;
    }

    function __claimExitedAssets(uint256 _positionTicket) private {
        bytes memory actionArgs = abi.encode(stakeWiseV3Vault, _positionTicket);

        vm.prank(vaultOwner);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(Actions.ClaimExitedAssets),
            _actionArgs: actionArgs
        });
    }

    function test_stake_success() public {
        uint256 amount = 7 ether;

        uint256 expectedStakeWiseV3VaultShares = stakeWiseV3Vault.convertToShares({_assets: amount});
        uint256 wethVaultBalancePre = wethToken.balanceOf(address(vaultProxy));

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit VaultTokenAdded(address(stakeWiseV3Vault));

        vm.recordLogs();

        __stake({_assetAmount: amount});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        uint256 wethVaulBalancePost = wethToken.balanceOf(address(vaultProxy));
        uint256 stakeWiseV3VaultExternalPositionBalance =
            stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        // Assert that the vault weth balance has been reduced
        assertEq(wethVaultBalancePre - wethVaulBalancePost, amount, "Incorrect vault weth balance");

        // Assert that the external position has the correct amount of shares.
        assertEq(
            stakeWiseV3VaultExternalPositionBalance,
            expectedStakeWiseV3VaultShares,
            "Incorrect external position stakeWiseV3 vault shares"
        );

        assertEq(assets, toArray(address(wethToken)), "Incorrect managed assets");
        assertEq(amounts, toArray(amount), "Incorrect managed asset amounts");

        // Check that the stakewise vault has been added to storage
        assertEq(
            stakeWiseV3ExternalPosition.getStakeWiseVaultTokens(),
            toArray(address(stakeWiseV3Vault)),
            "StakeWise vault token missing from storage"
        );
    }

    function test_redeem_successWithFullRedemption() public {
        __stake({_assetAmount: 7 ether});

        uint256 shares = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit VaultTokenRemoved(address(stakeWiseV3Vault));

        vm.recordLogs();

        __redeem({_sharesAmount: shares});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        // Shares balance should now be 0
        uint256 sharesBalancePostRedemption = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));

        assertEq(sharesBalancePostRedemption, 0, "Shares remaining post redemption");

        // Check that the stakewise vault has been removed from storage
        assertEq(
            stakeWiseV3ExternalPosition.getStakeWiseVaultTokens().length,
            0,
            "StakeWise vault token not removed from storage"
        );
    }

    function test_redeem_successWithPartialRedemption() public {
        __stake({_assetAmount: 7 ether});

        uint256 sharesBalancePreRedemption = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));

        uint256 redeemSharesAmount = sharesBalancePreRedemption / 3;

        __redeem({_sharesAmount: redeemSharesAmount});

        // Check that the stakewise vault is still in storage
        assertEq(
            stakeWiseV3ExternalPosition.getStakeWiseVaultTokens()[0],
            address(stakeWiseV3Vault),
            "StakeWise vault token missing from storage"
        );
    }

    function test_enterExitQueue_successWithFullSharesAmount() public {
        __stake({_assetAmount: 7 ether});

        uint256 shares = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit ExitRequestAdded(address(stakeWiseV3Vault), 0, shares);
        expectEmit(address(stakeWiseV3ExternalPosition));
        emit VaultTokenRemoved(address(stakeWiseV3Vault));

        vm.recordLogs();

        uint256 positionTicket = __enterExitQueue({_sharesAmount: shares});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        address expectedAsset = address(wethToken);
        uint256 expectedAssetAmount = stakeWiseV3Vault.convertToAssets(shares);

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(expectedAsset), "Incorrect managed assets");
        assertEq(amounts, toArray(expectedAssetAmount), "Incorrect managed asset amounts");

        assertEq(stakeWiseV3ExternalPosition.getStakeWiseVaultTokens().length, 0, "StakeWise vault still in storage");

        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        assertEq(exitRequests.length, 1, "ExitRequest not found in storage");

        assertEq(
            exitRequests[0].stakeWiseVaultAddress,
            address(stakeWiseV3Vault),
            "stakeWiseVaultAddress exitRequest mismatch"
        );

        assertEq(exitRequests[0].positionTicket, positionTicket, "positionTicket exitRequest mismatch");

        assertEq(exitRequests[0].sharesAmount, shares, "sharesAmount exitRequest mismatch");
    }

    function test_enterExitQueue_successWithPartialSharesAmount() public {
        __stake({_assetAmount: 7 ether});

        uint256 shares = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));
        uint256 sharesToExit = shares / 3;

        uint256 positionTicket = __enterExitQueue({_sharesAmount: sharesToExit});

        address expectedAsset = address(wethToken);
        // Position valuation should be shares = sharesToExit + sharesNotExited
        uint256 expectedAssetAmount = stakeWiseV3Vault.convertToAssets(shares);

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(expectedAsset), "Incorrect managed assets");
        assertEq(amounts, toArray(expectedAssetAmount), "Incorrect managed asset amounts");

        // StakeWise vault should still be in storage since position has not been fully requested for exit
        address[] memory stakeWiseVaultTokenAddresses = stakeWiseV3ExternalPosition.getStakeWiseVaultTokens();
        assertEq(stakeWiseVaultTokenAddresses.length, 1, "StakeWise vault missing from storage");
        assertEq(stakeWiseVaultTokenAddresses[0], address(stakeWiseV3Vault), "Wrong StakeWiseVault address in storage");

        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        assertEq(exitRequests.length, 1, "ExitRequest not found in storage");

        assertEq(
            exitRequests[0].stakeWiseVaultAddress,
            address(stakeWiseV3Vault),
            "stakeWiseVaultAddress exitRequest mismatch"
        );

        assertEq(exitRequests[0].positionTicket, positionTicket, "positionTicket exitRequest mismatch");
        assertEq(exitRequests[0].sharesAmount, sharesToExit, "sharesAmount exitRequest mismatch");
    }

    function test_claimExitedAssets_successWithFullClaim() public {
        __stake({_assetAmount: 3 ether});

        uint256 shares = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));
        uint256 sharesAssetValue = stakeWiseV3Vault.convertToAssets(shares);

        uint256 positionTicket = __enterExitQueue({_sharesAmount: shares});

        // Update the state so that the exit request can be processed
        // HarvestParams copied from this tx: https://goerli.etherscan.io/tx/0xe2cd481036d91f20c6807bfe780e1d9f3ec77c48299cd98f8a6cd20cd996f6c4

        stakeWiseV3Vault.updateState({
            harvestParams: IStakeWiseV3EthVault.HarvestParams({
                rewardsRoot: bytes32(0x8ee4e35ea60cab34e94ace67442083256dc3452dc8bccddba6e52265d7ec575f),
                reward: 0,
                unlockedMevReward: 0,
                proof: new bytes32[](0)
            })
        });

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit ExitRequestRemoved(address(stakeWiseV3Vault), positionTicket);

        uint256 vaultWethBalancePreClaim = wethToken.balanceOf(address(vaultProxy));

        vm.recordLogs();

        __claimExitedAssets({_positionTicket: positionTicket});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        uint256 vaultWethBalancePostClaim = wethToken.balanceOf(address(vaultProxy));

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        assertEq(assets.length, 0, "Incorrect managed assets");
        assertEq(amounts.length, 0, "Incorrect managed asset amounts");

        // Check that the exit request has been removed from storage
        assertEq(stakeWiseV3ExternalPosition.getExitRequests().length, 0, "ExitRequest still in storage");

        // Make sure that the weth has been returned to the vault
        assertEq(vaultWethBalancePostClaim, vaultWethBalancePreClaim + sharesAssetValue, "Incorrect vault weth balance");
    }

    function test_claimExitedAssets_successWithPartialClaim() public {
        __stake({_assetAmount: 3 ether});

        uint256 shares = stakeWiseV3Vault.balanceOf(address(stakeWiseV3ExternalPosition));

        uint256 positionTicket = __enterExitQueue({_sharesAmount: shares});

        // Adjust the balance of the recipient so that only a partial exit can be performed
        uint256 stakeWiseVaultBalance = 1 ether;
        vm.deal(address(stakeWiseV3Vault), stakeWiseVaultBalance);
        uint256 sharesAvailableToClaim = stakeWiseV3Vault.convertToShares({_assets: stakeWiseVaultBalance});

        // Update the state so that the exit request can be processed
        // HarvestParams copied from this tx: https://goerli.etherscan.io/tx/0xe2cd481036d91f20c6807bfe780e1d9f3ec77c48299cd98f8a6cd20cd996f6c4
        stakeWiseV3Vault.updateState({
            harvestParams: IStakeWiseV3EthVault.HarvestParams({
                rewardsRoot: bytes32(0x8ee4e35ea60cab34e94ace67442083256dc3452dc8bccddba6e52265d7ec575f),
                reward: 0,
                unlockedMevReward: 0,
                proof: new bytes32[](0)
            })
        });

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit ExitRequestRemoved(address(stakeWiseV3Vault), positionTicket);

        __claimExitedAssets({_positionTicket: positionTicket});

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(address(wethToken)), "Incorrect managed assets");
        // Valuation should be the leftover unclaimed shares
        assertEq(
            amounts,
            toArray(stakeWiseV3Vault.convertToAssets({_shares: shares - sharesAvailableToClaim})),
            "Incorrect managed assets"
        );

        // Check that the previous exit request has been removed from storage, and a new one added
        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        assertEq(exitRequests.length, 1, "ExitRequest missing from storage");
        assertEq(
            exitRequests[0].stakeWiseVaultAddress,
            address(stakeWiseV3Vault),
            "Wrong stakeWiseVaultAddress in exitRequest"
        );
        // TODO: Retrieve positionTicket from logs and check against actual value.
        assertNotEq(exitRequests[0].positionTicket, positionTicket, "Position ticket not updated");
        assertEq(exitRequests[0].sharesAmount, shares - sharesAvailableToClaim, "ExitRequest still in storage");
    }
}

// TODO: Uncomment once StakeWiseV3 Ethereum deployment is live
// contract EthereumTest is StakeWiseV3StakingPositionTest {
//     function setUp() public override {
//         setUpMainnetEnvironment(ETHEREUM_BLOCK_LATEST_TIME_SENSITIVE);

//         stakeWiseV3RegistryAddress = STAKEWISE_V3_VAULT_REGISTRY_ETHEREUM_ADDRESS;
//         stakeWiseV3Vault = ERC4626(STAKEWISE_V3_VAULT_TOKEN_ETHEREUM_ADDRESS);

//         super.setUp();
//     }
// }

contract GoerliTest is StakeWiseV3StakingPositionTest {
    function setUp() public override {
        setUpGoerliEnvironment(GOERLI_BLOCK_LATEST_TIME_SENSITIVE);

        stakeWiseV3RegistryAddress = STAKEWISE_V3_VAULT_REGISTRY_GOERLI_ADDRESS;
        stakeWiseV3Vault = IStakeWiseV3EthVault(STAKEWISE_V3_VAULT_TOKEN_GOERLI_ADDRESS);

        super.setUp();
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";
import {IStakeWiseV3EthVault} from "tests/interfaces/external/IStakeWiseV3EthVault.sol";
import {IStakeWiseV3KeeperRewards} from "tests/interfaces/external/IStakeWiseV3KeeperRewards.sol";
import {IStakeWiseV3StakingPositionLib} from "tests/interfaces/internal/IStakeWiseV3StakingPositionLib.sol";
import {IStakeWiseV3StakingPositionParser} from "tests/interfaces/internal/IStakeWiseV3StakingPositionParser.sol";

// We are using a fork block specific to StakeWise to ensure reliability of
// some complex and time-sensitive actions necessary for testing.
uint256 constant ETHEREUM_BLOCK_STAKEWISE_TIME_SENSITIVE = 18656282; // Nov 26th, 2023

enum Actions {
    Stake,
    Redeem,
    EnterExitQueue,
    ClaimExitedAssets
}

// ETHEREUM MAINNET CONSTANTS
address constant STAKEWISE_V3_ACTIVE_VAULT_TOKEN_ETHEREUM_ADDRESS = 0x8A93A876912c9F03F88Bc9114847cf5b63c89f56;
address constant STAKEWISE_V3_INACTIVE_VAULT_TOKEN_ETHEREUM_ADDRESS = 0xAC0F906E433d58FA868F936E8A43230473652885;
address constant STAKEWISE_V3_VAULT_REGISTRY_ETHEREUM_ADDRESS = 0x3a0008a588772446f6e656133C2D5029CC4FC20E;
address constant STAKEWISE_V3_KEEPER_ETHEREUM_ADDRESS = 0x6B5815467da09DaA7DC83Db21c9239d98Bb487b5;

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
    IStakeWiseV3EthVault internal stakeWiseInactiveVault;
    IStakeWiseV3EthVault internal stakeWiseActiveVault;

    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;
    IExternalPositionManager internal externalPositionManager;

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
        stakeWiseV3StakingPositionLib_ =
            deployStakeWiseV3StakingPositionLib({_wethAddress: _wethAddress, _referrer: address(0)});
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

    function deployStakeWiseV3StakingPositionLib(address _wethAddress, address _referrer)
        public
        returns (IStakeWiseV3StakingPositionLib)
    {
        bytes memory args = abi.encode(_wethAddress, _referrer);
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
            _actionId: uint256(Actions.Stake),
            _actionArgs: actionArgs
        });
    }

    // Note: StakeWiseV3 only allows redemptions through the redeem action when the vault does not have validators)
    function __redeem(IStakeWiseV3EthVault _stakeWiseVault, uint256 _sharesAmount) private {
        bytes memory actionArgs = abi.encode(_stakeWiseVault, _sharesAmount);

        vm.prank(fundOwner);

        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(stakeWiseV3ExternalPosition),
            _actionId: uint256(Actions.Redeem),
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
            _actionId: uint256(Actions.EnterExitQueue),
            _actionArgs: actionArgs
        });

        // Retrieve the position counter from the last exit request
        IStakeWiseV3StakingPositionLib.ExitRequest[] memory exitRequests = stakeWiseV3ExternalPosition.getExitRequests();

        positionTicket_ = exitRequests[exitRequests.length - 1].positionTicket;
        timestamp_ = exitRequests[exitRequests.length - 1].timestamp;
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
            _actionId: uint256(Actions.ClaimExitedAssets),
            _actionArgs: actionArgs
        });
    }

    /// @dev This logic is tied to the specific stakewise (active) vault used in this test suite
    /// We update rewards 3 times to move from the time where staking + exitRequests are allowed,
    /// to the updateReward that precedes the updateState we have the payload for.
    function __updateRewardsAndState(IStakeWiseV3EthVault _stakeWiseVault) private {
        bytes[] memory encodedUpdateRewards = new bytes[](3);
        // src: https://etherscan.io/tx/0x8cd2a7d4291557dd00ae27341da9aaaa42f0326c0e7292574d760e3961813a51
        encodedUpdateRewards[0] =
            hex"0000000000000000000000000000000000000000000000000000000000000020a3b7c24d2e4c7a5e59a89fe6d9c572a84579c1b2aa00f16445362be1d6818a99000000000000000000000000000000000000000000000000000000002e8b6703000000000000000000000000000000000000000000000000000000006563664b00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000003b6261666b726569657967687469336e686c71326f346a746336746e63357777647374656a6d6d64667776616d616a7071626273667371377a72697900000000000000000000000000000000000000000000000000000000000000000000000186acd182c3875d8c20f71a84a83fa041efa1e3d9f93441a4be9df199ab8ffd4567250875b3d497f60ecd1ae32c44ce29f9a79c8d85885081b25f661eca62d2a9271c49b44a31bcb9e182e889fcd2df9fc96bbcef29280eede95004638ad567c13d41124166fa96786c4e4b85353b9c91958e4e45a44aefd90df7f97b575b97e795661ce48508da34af15cb7fe9bde669d5b47aa568d4e7846b2d5676995d601e5072e97e05bafa901855d8b9e076a27e73df9b388e88d6363f99cef0b5344e4ce1b7951c54cba3b27797da86aea7f7db1b292093693cc10306ddc7e55649cb5d42f835f94df141fa62742c70d91e759c137d0620056eb23024ab3943fe1de627d52b156e1ce9c563446dcd5f1a0379d7c6b84c4692149c7c62f2dad75bb1136d6cbc4190d378c91815cc8e634c8dd8b977b974f006a4dfe9e6d48eeeee8fd2bcc75e1522201b94711741ef7edd22e17801750ad593b607180a3d0750184c331e53c8ef60fb8615d4ea4a73faf36846760d4e299b9114e5fa69501a0b955b512dd8c1f57fb8d61c0000000000000000000000000000000000000000000000000000";
        // src: https://etherscan.io/tx/0x1f87845bf71a8bcd79e11e4b02535646971d92ddaecec59812a87fae1d5b3efe
        encodedUpdateRewards[1] =
            hex"0000000000000000000000000000000000000000000000000000000000000020943fa99100bf76cc850ba553addc0ec758786f16dbf2ab61b924df61025968b3000000000000000000000000000000000000000000000000000000002f102cee0000000000000000000000000000000000000000000000000000000065640fcb00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000003b6261666b726569616b3479653333667169797562356977753433646b326e71693662696734647137756e7673696f6764693264796b75363666347500000000000000000000000000000000000000000000000000000000000000000000000186f781cabfa02dc2fbf40a95a369acf2553eabba41cc09c91a63f484b2aafb2af25d8b4a1b8457d81a1d506e1a54f19c82fb6917caf8830f31850794eec966dd9a1bc296470b37da4e050cd1a8cf89ae95d618f8536bdbac48374202a55c9eaf31e0627992ce2e0ae2d9c5bba233e93accdd2e55c512ad58673a2e8d5b04fa26529f1b544ceb5c2d0353ae8cf93fbd308acf9df0232e1c1e25a8fe868122522ecee70b67c0cb2aefbaf284f91fa2abf2f268a32b43c3fc97e001d40e7b4817142c2b151c7688f1bd2d7c8591fa944ca612ce57508040a478e57307b20c8ea1cbdcef43e6649963471ac591d9fe433dcfe9f99050e3b6b3d6ad30c3604ba9d0287f9821611c05ffbb8a033dc548dbf522d85c227d0d2e98c61936e45af8ff8fee99454b4de361df4a487bf617c646f5f488fdd78d1e0da041779d208f3f8adbdbb937f3d6141b4ae5105b667a6ef740c9ae3460f0c15cb38e3c1bc39b10810555b43ae902369c4f821449c6e5e47402b48b4598bc4f1715b472443e7a07b79d62211275f871da1c0000000000000000000000000000000000000000000000000000";
        // src: https://etherscan.io/tx/0x63d70c91a022a7314da657eecc9f77beca8bc94ce9eace032b3d68222670122c
        encodedUpdateRewards[2] =
            hex"0000000000000000000000000000000000000000000000000000000000000020a38b9138cc8d3b58b6e031cfdd43ea12a23ca6a11c984560a804741915eed4a3000000000000000000000000000000000000000000000000000000002ef658a3000000000000000000000000000000000000000000000000000000006564b94b00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000003b6261666b72656963716c657664346b77346e3779626564357074797a70336b636e6a62663473336372687674796166613679776d69737a6679616100000000000000000000000000000000000000000000000000000000000000000000000186b5dcd39969e9f6ceb4b0f5a4c57b161a7332f2e55c1befd10b6ecb3e006b5f776dc73663b493e5fd6987d05c4e7dd98c1788ed4b2747503253ef38ffc347f8f61bbe0d75eb34cb1b02b094e59209f5899e6a8ae6f40196c588a47361fc063071f93bb80674fcf7d4f958c8682169ebfa185427fa489bc7042fda04d7d21144f6311ba9b468ff0ba8fcdb94cfa1d212486a246bf1295c309e4a8a1aa673f4766e0c4a6cf25b28aa238853fdb9036555215523fa33e1b3ba39d401af15f1992171c7121c9feff44e20008161e57b0155cc4fdd4dc19cf8180a2ed487118b39d5aeb9bc5752530edf47c935da97476bdf2d7bdd9ec9002f07f51fcf5a3a534c9dbe9ff0671c059a12dc1e1335cdcb7482c41d7d32544ccc73da996ac99e8a626e99e8c4b6aa7706012432c6914f1f58c286edb204cba19d9e0a391c8e7aa3fdb4fa6d70da071c45b9c2f5d20c08bb69912903b4cc379bfb290de74e412623fde31d8b836f9bc646af4646def36b935723be6fb17ff925266af115dbf259d8a935307f21d4f4581b0000000000000000000000000000000000000000000000000000";

        uint256 rewardsDelay = stakeWiseV3Keeper.rewardsDelay();
        for (uint256 i = 0; i < encodedUpdateRewards.length; i++) {
            (IStakeWiseV3KeeperRewards.RewardsUpdateParams memory rewardsParams) =
                abi.decode(encodedUpdateRewards[i], (IStakeWiseV3KeeperRewards.RewardsUpdateParams));
            vm.warp(block.timestamp + rewardsDelay + 1);
            stakeWiseV3Keeper.updateRewards(rewardsParams);
        }

        // Update the state so that the exit request can be processed
        // HarvestParams copied from this tx: https://etherscan.io/tx/0x611f86e25df927b6fcfab9f8bcc901aee7c856123d6fbfe4d0f16a5e7f52fce4
        bytes memory encodedUpdateStateAndDeposit =
            hex"000000000000000000000000f052e0df010819602f0b22a7cb600e33ffc9135800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060a38b9138cc8d3b58b6e031cfdd43ea12a23ca6a11c984560a804741915eed4a300000000000000000000000000000000000000000000000000ef7dbcbc47ea000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000038b08645cf5fe9aa533f12fd963c047f6f3a9a6e3e504c1352baabad29349df9e1d133149353e32c6b5e9a80812d116730d3ad5cdfe962f700079e9f975c5de364d527de49ea7d0b4811b54c38b10ff4f861dee56372068df2a55bd4f382eaca2";

        (,, IStakeWiseV3EthVault.HarvestParams memory harvestParams) =
            abi.decode(encodedUpdateStateAndDeposit, (address, address, IStakeWiseV3EthVault.HarvestParams));

        // In order to update the state in a way that updates the exitQueue, a harvest must be performed.
        // To perform a harvest, the rewards must have updated since the last harvest.
        _stakeWiseVault.updateState({harvestParams: harvestParams});
    }

    function test_stake_success() public {
        IStakeWiseV3EthVault stakeWiseVault = stakeWiseInactiveVault;
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
        assertEq(
            stakeWiseVaultExternalPositionBalance,
            expectedStakeWiseV3VaultShares,
            "Incorrect external position stakeWiseV3 vault shares"
        );

        assertEq(assets, toArray(address(wethToken)), "Incorrect managed assets");
        assertEq(amounts, toArray(amount), "Incorrect managed asset amounts");

        // Check that the stakewise vault has been added to storage
        assertEq(
            stakeWiseV3ExternalPosition.getStakeWiseVaultTokens(),
            toArray(address(stakeWiseVault)),
            "StakeWise vault token missing from storage"
        );
    }

    function __test_redeem_success(bool _redeemAll) private {
        IStakeWiseV3EthVault stakeWiseVault = stakeWiseInactiveVault;
        __stake({_stakeWiseVault: stakeWiseVault, _assetAmount: 7 ether});

        uint256 sharesBalance = stakeWiseVault.getShares(address(stakeWiseV3ExternalPosition));

        uint256 sharesToRedeem = _redeemAll ? sharesBalance : sharesBalance / 3;

        if (_redeemAll) {
            expectEmit(address(stakeWiseV3ExternalPosition));
            emit VaultTokenRemoved(address(stakeWiseVault));
        }

        vm.recordLogs();

        __redeem({_stakeWiseVault: stakeWiseVault, _sharesAmount: sharesToRedeem});

        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        uint256 sharesBalancePostRedemption = stakeWiseVault.getShares(address(stakeWiseV3ExternalPosition));
        uint256 expectedSharesBalancePostRedemption = sharesBalance - sharesToRedeem;

        assertEq(sharesBalancePostRedemption, expectedSharesBalancePostRedemption, "Incorrect shares balance");

        if (_redeemAll) {
            // Check that the stakewise vault has been removed from storage
            assertEq(
                stakeWiseV3ExternalPosition.getStakeWiseVaultTokens().length,
                0,
                "StakeWise vault token not removed from storage"
            );
        } else {
            // Check that the stakewise vault is still in storage
            assertEq(
                stakeWiseV3ExternalPosition.getStakeWiseVaultTokens()[0],
                address(stakeWiseVault),
                "StakeWise vault token missing from storage"
            );
        }
    }

    function test_redeem_successWithFullRedemption() public {
        __test_redeem_success({_redeemAll: true});
    }

    function test_redeem_successWithPartialRedemption() public {
        __test_redeem_success({_redeemAll: false});
    }

    function __test_enterExitQueue_success(bool _exitAll) private {
        IStakeWiseV3EthVault stakeWiseVault = stakeWiseActiveVault;
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
            _assets: new address[](0)
        });

        address expectedAsset = address(wethToken);
        // Valuation should still equal initial balance (pending exit + remaining balance)
        uint256 expectedAssetAmount = stakeWiseVault.convertToAssets(sharesBalance);

        (address[] memory assets, uint256[] memory amounts) = stakeWiseV3ExternalPosition.getManagedAssets();

        assertEq(assets, toArray(expectedAsset), "Incorrect managed assets");
        assertEq(amounts, toArray(expectedAssetAmount), "Incorrect managed asset amounts");

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

    function test_enterExitQueue_successWithFullSharesAmount() public {
        __test_enterExitQueue_success({_exitAll: true});
    }

    function test_enterExitQueue_successWithPartialSharesAmount() public {
        __test_enterExitQueue_success({_exitAll: false});
    }

    function __test_claimExitedAssets_success(bool _fullyClaimable) private {
        IStakeWiseV3EthVault stakeWiseVault = stakeWiseActiveVault;
        __stake({_stakeWiseVault: stakeWiseVault, _assetAmount: 7 ether});

        uint256 sharesBalance = stakeWiseVault.getShares(address(stakeWiseV3ExternalPosition));

        (uint256 positionTicket, uint256 timestamp) =
            __enterExitQueue({_stakeWiseVault: stakeWiseVault, _sharesAmount: sharesBalance});

        uint256 sharesAvailableToClaim = sharesBalance;
        if (!_fullyClaimable) {
            // Adjust the Ether balance of the StakeWise vault so that it's insufficient for a full claim
            vm.deal(address(stakeWiseVault), stakeWiseVault.convertToAssets({_shares: sharesBalance}) / 3);
            sharesAvailableToClaim = stakeWiseVault.convertToShares({_assets: address(stakeWiseVault).balance});
        }

        __updateRewardsAndState({_stakeWiseVault: stakeWiseVault});

        expectEmit(address(stakeWiseV3ExternalPosition));
        emit ExitRequestRemoved(address(stakeWiseVault), positionTicket);

        uint256 vaultWethBalancePreClaim = wethToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        // Calculate expected remainingShares, and expected assets to receive
        (uint256 remainingShares,, uint256 claimedAssets) = stakeWiseVault.calculateExitedAssets({
            _receiver: address(stakeWiseV3ExternalPosition),
            _positionTicket: positionTicket,
            _timestamp: timestamp,
            _exitQueueIndex: uint256(stakeWiseVault.getExitQueueIndex({_positionTicket: positionTicket}))
        });

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
}

contract StakeWiseTestEthereum is StakeWiseV3StakingPositionTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_STAKEWISE_TIME_SENSITIVE);

        stakeWiseV3Keeper = IStakeWiseV3KeeperRewards(STAKEWISE_V3_KEEPER_ETHEREUM_ADDRESS);
        stakeWiseV3RegistryAddress = STAKEWISE_V3_VAULT_REGISTRY_ETHEREUM_ADDRESS;
        stakeWiseInactiveVault = IStakeWiseV3EthVault(STAKEWISE_V3_INACTIVE_VAULT_TOKEN_ETHEREUM_ADDRESS);
        stakeWiseActiveVault = IStakeWiseV3EthVault(STAKEWISE_V3_ACTIVE_VAULT_TOKEN_ETHEREUM_ADDRESS);

        super.setUp();
    }
}

contract StakeWiseTestEthereumV4 is StakeWiseTestEthereum {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}

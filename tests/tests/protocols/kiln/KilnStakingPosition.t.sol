// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {Actions, KilnUtils, STAKING_CONTRACT_ADDRESS_ETHEREUM} from "tests/utils/protocols/kiln/KilnUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IKilnStakingPositionLib} from "tests/interfaces/internal/IKilnStakingPositionLib.sol";
import {IKilnStakingPositionParser} from "tests/interfaces/internal/IKilnStakingPositionParser.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

contract KilnStakingPositionTest is IntegrationTest, KilnUtils {
    address internal vaultOwner = makeAddr("VaultOwner");
    address internal sharesBuyer = makeAddr("SharesBuyer");

    IKilnStakingPositionParser internal kilnStakingPositionParser;
    IKilnStakingPositionLib internal kilnStakingPositionLib;
    address internal kilnStakingExternalPositionProxyAddress;
    uint256 internal kilnStakinTypeId;

    IVault internal vaultProxy;
    IComptroller internal comptrollerProxy;

    function setUp() public override {
        setUpMainnetEnvironment(16733210);

        (kilnStakingPositionLib, kilnStakingPositionParser, kilnStakinTypeId) = deployKilnStaking({
            _stakingContract: STAKING_CONTRACT_ADDRESS_ETHEREUM,
            _wethToken: wethToken,
            _dispatcher: core.persistent.dispatcher,
            _externalPositionManager: core.release.externalPositionManager,
            _addressListRegistry: core.persistent.addressListRegistry
        });

        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: vaultOwner,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 1000 ether,
            _sharesBuyer: sharesBuyer
        });

        kilnStakingExternalPositionProxyAddress = address(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: comptrollerProxy,
                _typeId: kilnStakinTypeId
            })
        );
    }

    function testStake() public {
        uint256 validatorAmount = 5;
        uint256 actionId = uint256(Actions.Stake);
        bytes memory actionArgs = abi.encode(STAKING_CONTRACT_ADDRESS_ETHEREUM, validatorAmount);
        bytes memory callArgs = abi.encode(kilnStakingExternalPositionProxyAddress, actionId, actionArgs);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _vaultOwner: vaultOwner,
            _callArgs: callArgs
        });

        (address[] memory assets_, uint256[] memory amounts_) =
            IKilnStakingPositionLib(kilnStakingExternalPositionProxyAddress).getManagedAssets();

        address weth = assets_[0];
        uint256 amount = amounts_[0];

        assertEq(weth, address(wethToken));
        assertEq(amount, validatorAmount * 32 ether);
    }
}

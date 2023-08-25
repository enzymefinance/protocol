// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {Test} from "forge-std/Test.sol";

import {IHelperDataReader} from "tests/interfaces/internal/IHelperDataReader.sol";
import {IHelperDataReaderRouter} from "tests/interfaces/internal/IHelperDataReaderRouter.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IPolicyManager} from "tests/interfaces/internal/IPolicyManager.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IFundValueCalculatorRouter} from "tests/interfaces/internal/IFundValueCalculatorRouter.sol";

// TODO: increase test coverage, use standalone contracts for testing
contract HelperDataReaderTest is Test {
    IHelperDataReader internal helperDataReader;
    IHelperDataReaderRouter internal helperDataReaderRouter;

    address internal vaultAddress = 0xbb05D8bd8c8AA18e1aA05d695129dbe95190c2a7;

    function setUp() public {
        vm.createSelectFork("mainnet", 17_237_290);

        helperDataReader = __deployHelperReader({
            _fundValueCalculatorRouter: IFundValueCalculatorRouter(0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9),
            _externalPositionFactory: IExternalPositionFactory(0x0AAcb782205dde9eFf4862ACe9849DcE1ca3409f),
            _policyManager: IPolicyManager(0xADF5A8DB090627b153Ef0c5726ccfdc1c7aED7bd),
            _feeManager: IFeeManager(0xAf0DFFAC1CE85c3fCe4c2BF50073251F615EefC4)
        });

        address[] memory fundDeployers = new address[](1);
        fundDeployers[0] = 0x4f1C53F096533C04d8157EFB6Bca3eb22ddC6360;

        IHelperDataReaderRouter.HelperDataReaderInfo[] memory helperDataReadersInfo =
            new IHelperDataReaderRouter.HelperDataReaderInfo[](1);
        helperDataReadersInfo[0] =
            IHelperDataReaderRouter.HelperDataReaderInfo({helperDataReader: address(helperDataReader), version: 4});

        helperDataReaderRouter = __deployHelperDataReaderRouter({
            _dispatcher: IDispatcher(0xC3DC853dD716bd5754f421ef94fdCbac3902ab32),
            _helperDataReadersInfo: helperDataReadersInfo,
            _fundDeployers: fundDeployers
        });
    }

    // DEPLOYMENT HELPERS

    function __deployHelperReader(
        IFundValueCalculatorRouter _fundValueCalculatorRouter,
        IExternalPositionFactory _externalPositionFactory,
        IPolicyManager _policyManager,
        IFeeManager _feeManager
    ) private returns (IHelperDataReader) {
        return IHelperDataReader(
            deployCode(
                "HelperDataReader.sol",
                abi.encode(_fundValueCalculatorRouter, _externalPositionFactory, _policyManager, _feeManager)
            )
        );
    }

    function __deployHelperDataReaderRouter(
        IDispatcher _dispatcher,
        address[] memory _fundDeployers,
        IHelperDataReaderRouter.HelperDataReaderInfo[] memory _helperDataReadersInfo
    ) private returns (IHelperDataReaderRouter) {
        return IHelperDataReaderRouter(
            deployCode("HelperDataReaderRouter.sol", abi.encode(_dispatcher, _fundDeployers, _helperDataReadersInfo))
        );
    }

    function testGetVaultDetails() public {
        IHelperDataReader.VaultDetailsExtended memory vault =
            helperDataReader.getVaultDetailsExtendedDecoded(vaultAddress);

        assertEq(vault.name, "The Graph Delegation Alpha");
    }

    function testGetVaultDetailsViaRouter() public {
        (bytes memory vault,) = helperDataReaderRouter.getVaultDetails(vaultAddress);

        IHelperDataReader.VaultDetails memory vaultDecoded = abi.decode(vault, (IHelperDataReader.VaultDetails));

        assertEq(vaultDecoded.name, "The Graph Delegation Alpha");
    }
}

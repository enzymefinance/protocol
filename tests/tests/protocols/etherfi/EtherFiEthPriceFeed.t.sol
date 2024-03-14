// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IEtherFiWrappedEth} from "tests/interfaces/external/IEtherFiWrappedEth.sol";
import {IEtherFiEthPriceFeed} from "tests/interfaces/internal/IEtherFiEthPriceFeed.sol";

address constant ETHERFI_ETH_ADDRESS = 0x35fA164735182de50811E8e2E824cFb9B6118ac2;
address constant WRAPPED_ETHERFI_ETH_ADDRESS = 0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee;

contract EtherFiEthPriceFeedTest is IntegrationTest {
    IEtherFiEthPriceFeed internal etherFiEthPriceFeed;
    IERC20 internal eeth;
    IEtherFiWrappedEth internal weeth;

    function setUp() public override {
        setUpMainnetEnvironment();

        eeth = IERC20(ETHERFI_ETH_ADDRESS);
        weeth = IEtherFiWrappedEth(WRAPPED_ETHERFI_ETH_ADDRESS);
        etherFiEthPriceFeed = __deployPriceFeed({_eeth: address(eeth), _weeth: address(weeth)});
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed(address _eeth, address _weeth) private returns (IEtherFiEthPriceFeed) {
        bytes memory args = abi.encode(_eeth, _weeth);
        address addr = deployCode("EtherFiEthPriceFeed.sol", args);
        return IEtherFiEthPriceFeed(addr);
    }

    function test_calcUnderlyingValues_success() public {
        uint256 derivativeAmount = assetUnit({_asset: eeth}) * 3;
        uint256 expectedUnderlyingValue = weeth.getEETHByWeETH({_weETHAmount: derivativeAmount});

        (address[] memory underlyingAddresses, uint256[] memory underlyingValues) =
            etherFiEthPriceFeed.calcUnderlyingValues(address(eeth), derivativeAmount);

        assertEq(
            toArray(address(weeth)), underlyingAddresses, "Mismatch between actual and expected underlying address"
        );
        assertEq(
            toArray(expectedUnderlyingValue), underlyingValues, "Mismatch between actual and expected underlying value"
        );
    }

    function test_isSupportedAsset_success() public {
        assertTrue(etherFiEthPriceFeed.isSupportedAsset({_asset: address(eeth)}), "Unsupported asset");
    }

    function test_isSupportedAsset_successWithUnsupportedAsset() public {
        assertFalse(
            etherFiEthPriceFeed.isSupportedAsset({_asset: makeAddr("RandomToken")}), "Incorrectly supported asset"
        );
    }
}

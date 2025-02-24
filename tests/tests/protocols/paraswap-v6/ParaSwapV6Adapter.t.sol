// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IIntegrationManager as IIntegrationManagerProd} from
    "contracts/release/extensions/integration-manager/IIntegrationManager.sol";
import {IParaSwapV6Adapter as IParaSwapV6AdapterProd} from
    "contracts/release/extensions/integration-manager/integrations/adapters/interfaces/IParaSwapV6Adapter.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IParaSwapV6FeeVault} from "tests/interfaces/external/IParaSwapV6FeeVault.sol";
import {IParaSwapV6Adapter} from "tests/interfaces/internal/IParaSwapV6Adapter.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

address constant ETHEREUM_PARASWAP_V6_AUGUSTUS_SWAPPER = 0x6A000F20005980200259B80c5102003040001068;
address constant ETHEREUM_PARASWAP_V6_FEE_VAULT = 0x00700052c0608F670705380a4900e0a8080010CC;

struct SwapTestData {
    bytes encodedSwapData;
    address outgoingAssetAddress;
    address incomingAssetAddress;
    uint256 outgoingAssetAmount;
    uint256 incomingAssetAmount;
}

abstract contract ParaSwapV6AdapterTestBase is IntegrationTest {
    address internal fundOwner;
    address internal vaultProxyAddress;
    address internal comptrollerProxyAddress;
    address internal feeRecipientAddress;

    IParaSwapV6Adapter internal adapter;

    IParaSwapV6FeeVault internal feeVault;

    EnzymeVersion internal version;

    function __initialize(
        uint256 _chainId,
        EnzymeVersion _version,
        uint256 _forkBlock,
        address _augustusSwapperAddress,
        address _feeVaultAddress
    ) internal {
        setUpNetworkEnvironment({_chainId: _chainId, _forkBlock: _forkBlock});

        version = _version;

        adapter = __deployAdapter({_augustusSwapper: _augustusSwapperAddress});

        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);
        feeRecipientAddress = makeAddr("FeeRecipientAddress");

        if (_feeVaultAddress != address(0)) {
            feeVault = IParaSwapV6FeeVault(_feeVaultAddress);
        }
    }

    // DEPLOYMENT HELPERS

    function __deployAdapter(address _augustusSwapper) private returns (IParaSwapV6Adapter) {
        bytes memory args = abi.encode(getIntegrationManagerAddressForVersion(version), _augustusSwapper);
        address addr = deployCode("ParaSwapV6Adapter.sol", args);
        return IParaSwapV6Adapter(addr);
    }

    // ACTION HELPERS

    function __action(IParaSwapV6AdapterProd.Action _actionId, bytes memory _encodedActionArgs) internal {
        bytes memory actionArgs = abi.encode(_actionId, _encodedActionArgs);

        vm.prank(fundOwner);
        callOnIntegrationForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _adapterAddress: address(adapter),
            _selector: IParaSwapV6Adapter.action.selector,
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __encodeTakeOrderArgs(
        uint256 _minIncomingAssetAmount,
        uint256 _expectedIncomingAssetAmount,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        IParaSwapV6AdapterProd.Action _actionType,
        bytes memory _swapData
    ) private pure returns (bytes memory encodedTakeOrderArgs_) {
        encodedTakeOrderArgs_ = abi.encode(
            _minIncomingAssetAmount,
            _expectedIncomingAssetAmount,
            _outgoingAsset,
            _outgoingAssetAmount,
            _actionType,
            _swapData
        );

        return encodedTakeOrderArgs_;
    }

    function __registerAssetsAndSeedOutgoing(address _outgoingAssetAddress, address _incomingAssetAddress) private {
        // Ensure that all assets are registered
        addPrimitivesWithTestAggregator({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddresses: (toArray(_outgoingAssetAddress, _incomingAssetAddress)),
            _skipIfRegistered: true
        });

        // Seed the fund with the outgoing assets
        increaseTokenBalance({
            _token: IERC20(_outgoingAssetAddress),
            _to: vaultProxyAddress,
            _amount: assetUnit(IERC20(_outgoingAssetAddress)) * 123
        });
    }

    function __test_action_successSwapExactAmountIn(SwapTestData memory _swapData) internal {
        IERC20 outgoingAsset = IERC20(_swapData.outgoingAssetAddress);
        IERC20 incomingAsset = IERC20(_swapData.incomingAssetAddress);

        __registerAssetsAndSeedOutgoing({
            _outgoingAssetAddress: address(outgoingAsset),
            _incomingAssetAddress: address(incomingAsset)
        });

        uint256 preOrderOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance = incomingAsset.balanceOf(vaultProxyAddress);

        uint256 outgoingAssetAmount = _swapData.outgoingAssetAmount;

        vm.recordLogs();

        __action({
            _actionId: IParaSwapV6AdapterProd.Action.SwapExactAmountIn,
            _encodedActionArgs: _swapData.encodedSwapData
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(outgoingAsset)),
            _maxSpendAssetAmounts: toArray(outgoingAssetAmount),
            _incomingAssets: toArray(address(incomingAsset)),
            _minIncomingAssetAmounts: toArray(uint256(1))
        });

        uint256 postOrderOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);
        uint256 postOrderIncomingAssetBalance = incomingAsset.balanceOf(vaultProxyAddress);

        assertEq(
            postOrderOutgoingAssetBalance,
            preOrderOutgoingAssetBalance - outgoingAssetAmount,
            "Incorrect outgoing asset balance"
        );
        assertGt(postOrderIncomingAssetBalance, preOrderIncomingAssetBalance, "Incorrect incoming asset balance");
    }

    // TESTS

    function __test_action_successSwapExactAmountInWithPartnerFee(SwapTestData memory _swapData) internal {
        IERC20 outgoingAsset = IERC20(_swapData.outgoingAssetAddress);
        IERC20 incomingAsset = IERC20(_swapData.incomingAssetAddress);

        __registerAssetsAndSeedOutgoing({
            _outgoingAssetAddress: address(outgoingAsset),
            _incomingAssetAddress: address(incomingAsset)
        });

        uint256 preOrderPartnerFeeBalance =
            feeVault.getBalance({_tokenAddress: address(outgoingAsset), _partnerAddress: feeRecipientAddress});

        __action({
            _actionId: IParaSwapV6AdapterProd.Action.SwapExactAmountIn,
            _encodedActionArgs: _swapData.encodedSwapData
        });

        uint256 postOrderPartnerFeeBalance =
            feeVault.getBalance({_tokenAddress: address(incomingAsset), _partnerAddress: feeRecipientAddress});

        // Assert that partner fee has accrued
        assertGt(postOrderPartnerFeeBalance, preOrderPartnerFeeBalance, "Incorrect partner fee balance");
    }

    function __test_action_successSwapExactAmountOut(SwapTestData memory _swapData) internal {
        IERC20 outgoingAsset = IERC20(_swapData.outgoingAssetAddress);
        IERC20 incomingAsset = IERC20(_swapData.incomingAssetAddress);

        __registerAssetsAndSeedOutgoing({
            _outgoingAssetAddress: address(outgoingAsset),
            _incomingAssetAddress: address(incomingAsset)
        });

        uint256 preOrderOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);
        uint256 preOrderIncomingAssetBalance = incomingAsset.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        __action({
            _actionId: IParaSwapV6AdapterProd.Action.SwapExactAmountOut,
            _encodedActionArgs: _swapData.encodedSwapData
        });

        assertAdapterAssetsForAction({
            _logs: vm.getRecordedLogs(),
            _spendAssetsHandleTypeUint8: uint8(IIntegrationManagerProd.SpendAssetsHandleType.Transfer),
            _spendAssets: toArray(address(outgoingAsset)),
            _maxSpendAssetAmounts: toArray(_swapData.outgoingAssetAmount),
            _incomingAssets: toArray(address(incomingAsset)),
            _minIncomingAssetAmounts: toArray(_swapData.incomingAssetAmount)
        });

        uint256 postOrderOutgoingAssetBalance = outgoingAsset.balanceOf(vaultProxyAddress);
        uint256 postOrderIncomingAssetBalance = incomingAsset.balanceOf(vaultProxyAddress);

        assertLt(postOrderOutgoingAssetBalance, preOrderOutgoingAssetBalance, "Incorrect outgoing asset balance");
        assertEq(
            postOrderIncomingAssetBalance,
            preOrderIncomingAssetBalance + _swapData.incomingAssetAmount,
            "Incorrect incoming asset balance"
        );
        // Assert that the adapter does not contain any balance of outgoing asset
        assertEq(0, outgoingAsset.balanceOf(address(adapter)), "Adapter has remaining outgoing asset balance");
    }
}

abstract contract ParaSwapV6AdapterEthereumTestBase is ParaSwapV6AdapterTestBase {
    function __encodeSwapData(IParaSwapV6AdapterProd.SwapActionArgs memory _swapData)
        private
        pure
        returns (bytes memory swapData_)
    {
        return abi.encode(_swapData);
    }

    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _chainId: ETHEREUM_CHAIN_ID,
            _version: _version,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE_PARASWAP_V6,
            _augustusSwapperAddress: ETHEREUM_PARASWAP_V6_AUGUSTUS_SWAPPER,
            _feeVaultAddress: ETHEREUM_PARASWAP_V6_FEE_VAULT
        });
    }

    function test_action_successSwapExactAmountOut() public {
        SwapTestData memory swapData = SwapTestData({
            encodedSwapData: __encodeSwapData(
                IParaSwapV6AdapterProd.SwapActionArgs({
                    executor: 0xA0F408A000017007015e0F00320e470D00090a5B,
                    swapData: IParaSwapV6AdapterProd.SwapData({
                        srcToken: ETHEREUM_WETH,
                        destToken: ETHEREUM_USDC,
                        fromAmount: 200000000000000,
                        toAmount: 500000,
                        quotedAmount: 187489829905450,
                        metadata: bytes32(0x073ea370ac6449e8b75e9ee98eb91344000000000000000000000000014ceeec)
                    }),
                    partnerAndFee: 4951760157141521099596496896,
                    executorData: hex"00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000180000001000000000000000000000000ec00000000000000cc0000000000002710831bf48183b999fde45294b14b55199072f0801b00e000c500c50000000b000300000000000000000000000000000000000000000000000000000000c31b8d7a0000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000000000000fffffffffffffffffffffffffffffffffffffffffffffffffffffffffff85ee0000000000000000000000000fffd8963efd1fc6a506488495d951d5263988d25000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
                })
            ),
            outgoingAssetAddress: ETHEREUM_WETH,
            incomingAssetAddress: ETHEREUM_USDC,
            outgoingAssetAmount: 200000000000000,
            incomingAssetAmount: 500000
        });

        __test_action_successSwapExactAmountOut({_swapData: swapData});
    }

    function test_action_swapExactAmountIn() public {
        // Data obtained from ParaSwap Swap Endpoint ( https://api.paraswap.io/swap?srcToken=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&destToken=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48&amount=300000000000000000&network=1&slippage=1&side=SELL&version=6.2&onlyParams=true )
        SwapTestData memory swapData = SwapTestData({
            encodedSwapData: __encodeSwapData(
                IParaSwapV6AdapterProd.SwapActionArgs({
                    executor: 0x000010036C0190E009a000d0fc3541100A07380A,
                    swapData: IParaSwapV6AdapterProd.SwapData({
                        srcToken: ETHEREUM_WETH,
                        destToken: ETHEREUM_USDC,
                        fromAmount: 300000000000000000,
                        toAmount: 1,
                        quotedAmount: 800615423,
                        metadata: bytes32(0x33b8dc4fc1c5482a8c0e7188ff4f71eb000000000000000000000000014ceeeb)
                    }),
                    partnerAndFee: 4951760157141521099596496896,
                    executorData: hex"000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a0e592427a0aece92de3edee1f18e0157c0586156400000140008400000000000300000000000000000000000000000000000000000000000000000000c04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000067b3b8990000000000000000000000000000000000000000000000000429d069189e00000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bc02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000"
                })
            ),
            outgoingAssetAddress: ETHEREUM_WETH,
            incomingAssetAddress: ETHEREUM_USDC,
            outgoingAssetAmount: 300000000000000000,
            incomingAssetAmount: 1
        });

        __test_action_successSwapExactAmountIn({_swapData: swapData});
    }

    function test_action_successSwapExactAmountInWithPartnerFee() public {
        // partnerAndFee data queried from the endpoint with address `0x5c73cfcAb11fd5d50F259f56Faf8B7a5A8C17515` corresponding to makeAddr("FeeRecipientAddress")
        SwapTestData memory swapData = SwapTestData({
            encodedSwapData: __encodeSwapData(
                IParaSwapV6AdapterProd.SwapActionArgs({
                    executor: 0x000010036C0190E009a000d0fc3541100A07380A,
                    swapData: IParaSwapV6AdapterProd.SwapData({
                        srcToken: ETHEREUM_WETH,
                        destToken: ETHEREUM_USDC,
                        fromAmount: 300000000000000000,
                        toAmount: 1,
                        quotedAmount: 800615423,
                        metadata: bytes32(0x33b8dc4fc1c5482a8c0e7188ff4f71eb000000000000000000000000014ceeeb)
                    }),
                    partnerAndFee: 41817403608166406240232500103763723179401833452635303764005648926202048544818,
                    executorData: hex"000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a0e592427a0aece92de3edee1f18e0157c0586156400000140008400000000000300000000000000000000000000000000000000000000000000000000c04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000067b3b8990000000000000000000000000000000000000000000000000429d069189e00000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bc02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000"
                })
            ),
            outgoingAssetAddress: ETHEREUM_WETH,
            incomingAssetAddress: ETHEREUM_USDC,
            outgoingAssetAmount: 300000000000000000,
            incomingAssetAmount: 1
        });
        __test_action_successSwapExactAmountInWithPartnerFee({_swapData: swapData});
    }

    function test_action_successSwapExactAmountInFeeOnTransferTokenData() public {
        // Data obtained from ParaSwap Swap Endpoint ( https://api.paraswap.io/swap?srcToken=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&destToken=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48&amount=500000&network=1&slippage=1&side=BUY&version=6.2&onlyParams=true )
        SwapTestData memory swapData = SwapTestData({
            encodedSwapData: __encodeSwapData(
                IParaSwapV6AdapterProd.SwapActionArgs({
                    executor: 0x000010036C0190E009a000d0fc3541100A07380A,
                    swapData: IParaSwapV6AdapterProd.SwapData({
                        srcToken: ETHEREUM_PAXG,
                        destToken: ETHEREUM_USDC,
                        fromAmount: 200000000000000,
                        toAmount: 1,
                        quotedAmount: 586409,
                        metadata: bytes32(0x9b7fc6052a164c2c96b864cb4b2ac97b000000000000000000000000014ceeec)
                    }),
                    partnerAndFee: 4951760157141521099596496896,
                    executorData: hex"000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a0e592427a0aece92de3edee1f18e0157c0586156400000140008400000000000300000000000000000000000000000000000000000000000000000000c04b8d59000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000006a000f20005980200259b80c51020030400010680000000000000000000000000000000000000000000000000000000067b3b89e0000000000000000000000000000000000000000000000000000b5e620f480000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002b45804880de22913dafe09f4980848ece6ecbaf78000bb8a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000"
                })
            ),
            outgoingAssetAddress: ETHEREUM_PAXG,
            incomingAssetAddress: ETHEREUM_USDC,
            outgoingAssetAmount: 200000000000000,
            incomingAssetAmount: 1
        });

        __test_action_successSwapExactAmountIn({_swapData: swapData});
    }
}

contract ParaSwapV6AdapterEthereumTest is ParaSwapV6AdapterEthereumTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current});
    }
}

contract ParaSwapV6AdapterEthereumTestV4 is ParaSwapV6AdapterEthereumTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4});
    }
}

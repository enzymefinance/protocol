// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";

import {CommonUtils} from "tests/utils/CommonUtils.sol";
import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";
import {Uint256ArrayLib} from "tests/utils/libs/Uint256ArrayLib.sol";

import {IBalancerV2Vault} from "tests/interfaces/external/IBalancerV2Vault.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IDerivativePriceFeed} from "tests/interfaces/internal/IDerivativePriceFeed.sol";

enum ComposableStablePoolExitKind {
    EXACT_BPT_IN_FOR_ONE_TOKEN_OUT,
    BPT_IN_FOR_EXACT_TOKENS_OUT,
    EXACT_BPT_IN_FOR_ALL_TOKENS_OUT
}

enum ComposableStablePoolJoinKind {
    INIT,
    EXACT_TOKENS_IN_FOR_BPT_OUT,
    TOKEN_IN_FOR_EXACT_BPT_OUT,
    ALL_TOKENS_IN_FOR_EXACT_BPT_OUT
}

enum LegacyStablePoolExitKind {
    EXACT_BPT_IN_FOR_ONE_TOKEN_OUT,
    EXACT_BPT_IN_FOR_TOKENS_OUT,
    BPT_IN_FOR_EXACT_TOKENS_OUT
}

enum LegacyStablePoolJoinKind {
    INIT,
    EXACT_TOKENS_IN_FOR_BPT_OUT,
    TOKEN_IN_FOR_EXACT_BPT_OUT
}

enum WeightedPoolExitKind {
    EXACT_BPT_IN_FOR_ONE_TOKEN_OUT,
    EXACT_BPT_IN_FOR_TOKENS_OUT,
    BPT_IN_FOR_EXACT_TOKENS_OUT
}

enum WeightedPoolJoinKind {
    INIT,
    EXACT_TOKENS_IN_FOR_BPT_OUT,
    TOKEN_IN_FOR_EXACT_BPT_OUT,
    ALL_TOKENS_IN_FOR_EXACT_BPT_OUT
}

abstract contract BalancerV2Utils {
    address internal constant ETHEREUM_AUTHORIZER_ADAPTER_ADDRESS = 0x8F42aDBbA1B16EaAE3BB5754915E0D06059aDd75;
    address internal constant ETHEREUM_GAUGE_CONTROLLER_ADDRESS = 0xC128468b7Ce63eA702C1f104D55A2566b13D3ABD;
    address internal constant ETHEREUM_MINTER_ADDRESS = 0x239e55F427D44C3cc793f49bFB507ebe76638a2b;
    address internal constant VAULT_ADDRESS = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    // Factories
    address internal constant ETHEREUM_COMPOSABLE_STABLE_POOL_FACTORY_V3_ADDRESS =
        0xdba127fBc23fb20F5929C546af220A991b5C6e01;
    address internal constant ETHEREUM_WEIGHTED_POOL_2_TOKENS_FACTORY_V1_ADDRESS =
        0xA5bf2ddF098bb0Ef6d120C98217dD6B141c74EE0;

    address internal constant POLYGON_COMPOSABLE_STABLE_POOL_FACTORY_V1_ADDRESS =
        0x136FD06Fa01eCF624C7F2B3CB15742c1339dC2c4;
    address internal constant POLYGON_COMPOSABLE_STABLE_POOL_FACTORY_V3_ADDRESS =
        0x7bc6C0E73EDAa66eF3F6E2f27b0EE8661834c6C9;
    address internal constant POLYGON_WEIGHTED_POOL_FACTORY_V1_ADDRESS = 0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9;

    // Pools: Composable Stable

    // Aave Boosted Stable Pool
    address internal immutable ETHEREUM_AAVE_BOOSTED_STABLE_POOL_ADDRESS;
    bytes32 internal constant ETHEREUM_AAVE_BOOSTED_STABLE_POOL_ID =
        0xfebb0bbf162e64fb9d0dfe186e517d84c395f016000000000000000000000502;
    address internal constant ETHEREUM_AAVE_BOOSTED_STABLE_POOL_FACTORY_ADDRESS =
        ETHEREUM_COMPOSABLE_STABLE_POOL_FACTORY_V3_ADDRESS;
    // USDC-DAI-USDT
    address internal immutable ETHEREUM_USDC_DAI_USDT_POOL_ADDRESS;
    bytes32 internal constant ETHEREUM_USDC_DAI_USDT_POOL_ID =
        0x79c58f70905f734641735bc61e45c19dd9ad60bc0000000000000000000004e7;
    address internal constant ETHEREUM_USDC_DAI_USDT_POOL_FACTORY_ADDRESS =
        ETHEREUM_COMPOSABLE_STABLE_POOL_FACTORY_V3_ADDRESS;
    address internal constant ETHEREUM_USDC_DAI_USDT_POOL_GAUGE_ADDRESS = 0x5612876e6F6cA370d93873FE28c874e89E741fB9;

    // wMATIC-stMATIC
    address internal immutable POLYGON_wMATIC_stMATIC_POOL_ADDRESS;
    bytes32 internal constant POLYGON_wMATIC_stMATIC_POOL_ID =
        0x8159462d255c1d24915cb51ec361f700174cd99400000000000000000000075d;
    address internal constant POLYGON_wMATIC_stMATIC_POOL_FACTORY_ADDRESS =
        POLYGON_COMPOSABLE_STABLE_POOL_FACTORY_V1_ADDRESS;
    // wstETH-boosted aWETH
    address internal immutable POLYGON_wstETH_BOOSTED_aWETH_POOL_ADDRESS;
    bytes32 internal constant POLYGON_wstETH_BOOSTED_aWETH_POOL_ID =
        0x4a77ef015ddcd972fd9ba2c7d5d658689d090f1a000000000000000000000b38;
    address internal constant POLYGON_wstETH_BOOSTED_aWETH_POOL_FACTORY_ADDRESS =
        POLYGON_COMPOSABLE_STABLE_POOL_FACTORY_V3_ADDRESS;

    // Pools: Misc stable
    // STETH
    address internal immutable ETHEREUM_STETH_POOL_ADDRESS;
    bytes32 internal constant ETHEREUM_STETH_POOL_ID =
        0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080;

    // Pools: Weighted
    // 80-BAL-20-WETH
    address internal immutable ETHEREUM_80_BAL_20_WETH_POOL_ADDRESS;
    bytes32 internal constant ETHEREUM_80_BAL_20_WETH_POOL_ID =
        0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014;
    address internal constant ETHEREUM_80_BAL_20_WETH_POOL_FACTORY_ADDRESS =
        ETHEREUM_WEIGHTED_POOL_2_TOKENS_FACTORY_V1_ADDRESS;
    // Tricrypto
    address internal immutable POLYGON_TRICRYPTO_POOL_ADDRESS;
    address internal constant POLYGON_TRICRYPTO_POOL_GAUGE_ADDRESS = 0x0F09F70Ed59202c77aC667f574A5f79bC65CeA48;
    bytes32 internal constant POLYGON_TRICRYPTO_POOL_ID =
        0x03cd191f589d12b0582a99808cf19851e468e6b500010000000000000000000a;
    address internal constant POLYGON_TRICRYPTO_POOL_FACTORY_ADDRESS = POLYGON_WEIGHTED_POOL_FACTORY_V1_ADDRESS;

    constructor() {
        ETHEREUM_AAVE_BOOSTED_STABLE_POOL_ADDRESS = getBalancerV2PoolAddress(ETHEREUM_AAVE_BOOSTED_STABLE_POOL_ID);
        ETHEREUM_STETH_POOL_ADDRESS = getBalancerV2PoolAddress(ETHEREUM_STETH_POOL_ID);
        ETHEREUM_USDC_DAI_USDT_POOL_ADDRESS = getBalancerV2PoolAddress(ETHEREUM_USDC_DAI_USDT_POOL_ID);
        ETHEREUM_80_BAL_20_WETH_POOL_ADDRESS = getBalancerV2PoolAddress(ETHEREUM_80_BAL_20_WETH_POOL_ID);

        POLYGON_wMATIC_stMATIC_POOL_ADDRESS = getBalancerV2PoolAddress(POLYGON_wMATIC_stMATIC_POOL_ID);
        POLYGON_wstETH_BOOSTED_aWETH_POOL_ADDRESS = getBalancerV2PoolAddress(POLYGON_wstETH_BOOSTED_aWETH_POOL_ID);
        POLYGON_TRICRYPTO_POOL_ADDRESS = getBalancerV2PoolAddress(POLYGON_TRICRYPTO_POOL_ID);
    }

    function getBalancerV2PoolAddress(bytes32 _poolId) internal pure returns (address poolAddress_) {
        return address(uint160(uint256(_poolId) >> (12 * 8)));
    }
}

contract BalancerV2Reenterer is BalancerV2Utils, CommonUtils {
    using AddressArrayLib for address[];
    using Uint256ArrayLib for uint256[];

    struct ReentrantCall {
        address target;
        bytes data;
    }

    IBalancerV2Vault internal constant balancer = IBalancerV2Vault(VAULT_ADDRESS);

    ReentrantCall internal reentrantCall;

    receive() external payable {
        // Attempted reentrant call
        Address.functionCall(reentrantCall.target, reentrantCall.data);
    }

    constructor(ReentrantCall memory _reentrantCall) {
        reentrantCall = _reentrantCall;
    }

    function join(bytes32 _poolId, IERC20 _joinAsset, uint256 _joinAmount) external payable {
        // Format data for Balancer join
        (address[] memory poolTokens,,) = balancer.getPoolTokens(_poolId);
        uint256[] memory amountsInVerbose = new uint256[](poolTokens.length);

        {
            (bool joinAssetFound, uint256 joinAssetIndex) = poolTokens.find(address(_joinAsset));
            require(joinAssetFound, "BalancerV2Reenterer: Join asset not found");

            amountsInVerbose[joinAssetIndex] = _joinAmount;
        }

        // For now we'll assume that this JoinKind and userData format for exact-tokens-in are the same on all pools,
        // but this might need to be passed in if that is not the case

        // If BPT is also a member of its own pool tokens (i.e., ComposableStablePool),
        // remove it from the amounts passed as userData
        uint256[] memory amountsInWithoutBpt = amountsInVerbose;
        {
            address bptAddress = getBalancerV2PoolAddress(_poolId);
            (bool bptFound, uint256 bptIndex) = poolTokens.find(bptAddress);
            if (bptFound) {
                amountsInWithoutBpt = amountsInWithoutBpt.removeAtIndex(bptIndex);
            }
        }

        bytes memory userData =
            abi.encode(ComposableStablePoolJoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amountsInWithoutBpt, 1);

        IBalancerV2Vault.PoolBalanceChange memory request = IBalancerV2Vault.PoolBalanceChange({
            assets: poolTokens,
            limits: amountsInVerbose,
            userData: userData,
            useInternalBalance: false
        });

        // Join on Balancer
        _joinAsset.approve(address(balancer), _joinAmount);
        balancer.joinPool{value: msg.value}({
            _poolId: _poolId,
            _sender: address(this),
            _recipient: address(this),
            _request: request
        });
    }
}

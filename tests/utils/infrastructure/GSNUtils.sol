// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IGSNForwarder} from "tests/interfaces/external/IGSNForwarder.sol";
import {IGSNPaymaster} from "tests/interfaces/external/IGSNPaymaster.sol";
import {IGSNRelayHub} from "tests/interfaces/external/IGSNRelayHub.sol";
import {IGSNTypes} from "tests/interfaces/external/IGSNTypes.sol";

bytes32 constant ETHEREUM_DOMAIN_SEPARATOR = 0x2faf2522ab3d28e3d6391818d17f33f3cd87ed88d7f51fe14cf24a08ce656414;
address constant ETHEREUM_RELAY_HUB = 0x9e59Ea5333cD4f402dAc320a04fafA023fe3810D;
address constant ETHEREUM_RELAY_WORKER = 0x1FD0C666094d8c5daE247aA6C3C4c33Fd21bdC91;
address constant ETHEREUM_TRUSTED_FORWARDER = 0xca57e5D6218AeB093D76372B51Ba355CfB3C6Cd0;

// Copied from GsnEip712Library
string constant GENERIC_PARAMS =
    "address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data,uint256 validUntil";
bytes constant RELAY_DATA_TYPE =
    "RelayData(uint256 gasPrice,uint256 pctRelayFee,uint256 baseRelayFee,address relayWorker,address paymaster,address forwarder,bytes paymasterData,uint256 clientId)";
string constant RELAY_REQUEST_NAME = "RelayRequest";
string constant RELAY_REQUEST_SUFFIX = string(abi.encodePacked("RelayData relayData)", RELAY_DATA_TYPE));
bytes constant RELAY_REQUEST_TYPE =
    abi.encodePacked(RELAY_REQUEST_NAME, "(", GENERIC_PARAMS, ",", RELAY_REQUEST_SUFFIX);
bytes32 constant RELAY_DATA_TYPE_HASH = keccak256(RELAY_DATA_TYPE);
bytes32 constant RELAY_REQUEST_TYPE_HASH = keccak256(RELAY_REQUEST_TYPE);

abstract contract GSNUtils is AddOnUtilsBase {
    function gsnConstructRelayRequest(
        address _from,
        address _to,
        bytes memory _txData,
        address _paymasterAddress,
        bool _topUp,
        address _relayWorker
    ) internal view returns (IGSNTypes.RelayRequest memory relayRequest_) {
        address trustedForwarderAddress = IGSNPaymaster(_paymasterAddress).trustedForwarder();
        uint256 nonce = IGSNForwarder(trustedForwarderAddress).getNonce(_from);

        return IGSNTypes.RelayRequest({
            request: IGSNForwarder.ForwardRequest({
                from: _from,
                to: _to,
                value: 0, // Always 0 in enzyme
                gas: 10_000_000, // High, safe amount of gas
                nonce: nonce,
                data: _txData,
                validUntil: block.timestamp
            }),
            relayData: IGSNTypes.RelayData({
                gasPrice: 10e9, // 10 gwei
                pctRelayFee: 10, // value on eth mainnet
                baseRelayFee: 0, // value on eth mainnet
                relayWorker: _relayWorker,
                paymaster: _paymasterAddress,
                forwarder: trustedForwarderAddress,
                paymasterData: gsnEncodePaymasterData({_shouldTopUpDeposit: _topUp}),
                clientId: 1 // dummy value
            })
        });
    }

    function gsnEncodePaymasterData(bool _shouldTopUpDeposit) internal pure returns (bytes memory paymasterData_) {
        return abi.encode(_shouldTopUpDeposit);
    }

    function gsnRelayCall(
        address _from,
        address _to,
        bytes memory _txData,
        address _paymasterAddress,
        bool _topUp,
        uint256 _privateKey
    ) internal {
        IGSNRelayHub relayHub;
        address relayWorker;
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            relayHub = IGSNRelayHub(ETHEREUM_RELAY_HUB);
            relayWorker = ETHEREUM_RELAY_WORKER;
        } else {
            revert("gsnRelayCall: Unsupported network");
        }

        // Construct request
        IGSNTypes.RelayRequest memory relayRequest = gsnConstructRelayRequest({
            _from: _from,
            _to: _to,
            _txData: _txData,
            _paymasterAddress: _paymasterAddress,
            _topUp: _topUp,
            _relayWorker: relayWorker
        });

        // Sign request
        bytes memory signature = gsnSignRelayCall({_privateKey: _privateKey, _relayRequest: relayRequest});

        // Relay call
        uint256 externalCallDataCostOverhead = 22_414;
        uint256 msgGas = relayRequest.request.gas + 1_000_000; // Add a buffer above the actual request action cost
        vm.prank(relayWorker, relayWorker);
        vm.txGasPrice(relayRequest.relayData.gasPrice);
        relayHub.relayCall{gas: msgGas}({
            _maxAcceptanceBudget: 285252, // Hardcoded in the Enzyme relayer logic
            _relayRequest: relayRequest,
            _signature: signature,
            _approvalData: "", // Can be empty
            _externalGasLimit: msgGas + externalCallDataCostOverhead
        });
    }

    function gsnSignRelayCall(uint256 _privateKey, IGSNTypes.RelayRequest memory _relayRequest)
        internal
        view
        returns (bytes memory signature_)
    {
        bytes32 domainSeparator;
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            domainSeparator = ETHEREUM_DOMAIN_SEPARATOR;
        } else {
            revert("gsnSignRelayCall: Unsupported network");
        }

        bytes memory suffixData = abi.encode(
            keccak256(
                abi.encode(
                    RELAY_DATA_TYPE_HASH,
                    _relayRequest.relayData.gasPrice,
                    _relayRequest.relayData.pctRelayFee,
                    _relayRequest.relayData.baseRelayFee,
                    _relayRequest.relayData.relayWorker,
                    _relayRequest.relayData.paymaster,
                    _relayRequest.relayData.forwarder,
                    keccak256(_relayRequest.relayData.paymasterData),
                    _relayRequest.relayData.clientId
                )
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                keccak256(
                    abi.encodePacked(
                        RELAY_REQUEST_TYPE_HASH,
                        uint256(uint160(_relayRequest.request.from)),
                        uint256(uint160(_relayRequest.request.to)),
                        _relayRequest.request.value,
                        _relayRequest.request.gas,
                        _relayRequest.request.nonce,
                        keccak256(_relayRequest.request.data),
                        _relayRequest.request.validUntil,
                        suffixData
                    )
                )
            )
        );

        return createSignature({_privateKey: _privateKey, _digest: digest});
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./../../../release/interfaces/ISynthetix.sol";
import "./../../interfaces/ISynthetixExchanger.sol";
import "./../../interfaces/ISynthetixDelegateApprovals.sol";
import "./../../tokens/MockSynthetixToken.sol";

contract MockSynthetix is ISynthetix {
    address public immutable DELEGATE_APPROVALS;
    address public immutable EXCHANGER;

    mapping(bytes32 => address) public synthsByCurrencyKey;

    constructor(address _delegateApprovals, address _exchanger) public {
        DELEGATE_APPROVALS = _delegateApprovals;
        EXCHANGER = _exchanger;
    }

    function exchangeOnBehalfWithTracking(
        address exchangeForAddress,
        bytes32 sourceCurrencyKey,
        uint256 sourceAmount,
        bytes32 destinationCurrencyKey,
        address,
        bytes32
    ) external override returns (uint256) {
        require(
            ISynthetixDelegateApprovals(DELEGATE_APPROVALS).canExchangeFor(
                exchangeForAddress,
                msg.sender
            ),
            "Not approved to act on behalf"
        );

        MockSynthetixToken sourceSynth = MockSynthetixToken(
            synthsByCurrencyKey[sourceCurrencyKey]
        );
        MockSynthetixToken destinationSynth = MockSynthetixToken(
            synthsByCurrencyKey[destinationCurrencyKey]
        );
        require(!sourceSynth.isLocked(exchangeForAddress), "Cannot settle during waiting period");

        (uint256 _amountReceived, , ) = ISynthetixExchanger(EXCHANGER).getAmountsForExchange(
            sourceAmount,
            sourceCurrencyKey,
            destinationCurrencyKey
        );

        sourceSynth.burnFrom(exchangeForAddress, sourceAmount);

        destinationSynth.mintFor(exchangeForAddress, _amountReceived);

        destinationSynth.lock(exchangeForAddress);

        return _amountReceived;
    }

    function setSynth(bytes32 currencyKey, address synth) external {
        synthsByCurrencyKey[currencyKey] = synth;
    }
}

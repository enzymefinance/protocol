// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./../../release/interfaces/ISynthetixExchangeRates.sol";
import "./../tokens/MockSynthetixToken.sol";

/// @dev Synthetix Integratee. Mocks functionalities from the folllowing synthetix contracts
/// Synthetix, SynthetixAddressResolver, SynthetixDelegateApprovals
/// Link to contracts: <https://github.com/Synthetixio/synthetix/tree/develop/contracts>
contract MockSynthetixIntegratee is Ownable {
    using SafeMath for uint256;

    mapping(address => mapping(address => bool)) private authorizerToDelegateToApproval;
    mapping(bytes32 => address) private currencyKeyToSynth;

    address private immutable EXCHANGE_RATES;
    uint256 private immutable FEE;

    uint256 private constant UNIT_FEE = 1000;

    constructor(uint256 _fee, address _exchangeRates) public {
        FEE = _fee;
        EXCHANGE_RATES = address(_exchangeRates);
    }

    receive() external payable {}

    function exchangeOnBehalfWithTracking(
        address _exchangeForAddress,
        bytes32 _srcCurrencyKey,
        uint256 _srcAmount,
        bytes32 _destinationCurrencyKey,
        address,
        bytes32
    ) external returns (uint256 amountReceived_) {
        require(
            canExchangeFor(msg.sender, _exchangeForAddress),
            "exchangeOnBehalfWithTracking: Not approved to act on behalf"
        );

        amountReceived_ = __calculateAndSwap(
            _exchangeForAddress,
            _srcAmount,
            _srcCurrencyKey,
            _destinationCurrencyKey
        );

        return amountReceived_;
    }

    function getAmountsForExchange(
        uint256 _srcAmount,
        bytes32 _srcCurrencyKey,
        bytes32 _destCurrencyKey
    )
        public
        view
        returns (
            uint256 amountReceived_,
            uint256 fee_,
            uint256 exchangeFeeRate_
        )
    {
        ISynthetixExchangeRates exchangeRates = ISynthetixExchangeRates(EXCHANGE_RATES);
        // TODO: temporary removed to avoid stack too deep
        // require(
        //     currencyKeyToSynth[_srcCurrencyKey] != address(0) &&
        //         currencyKeyToSynth[_destCurrencyKey] != address(0),
        //     "getAmountsForExchange: Currency key doesn't have an associated synth"
        // );

        (uint256 srcRate, ) = exchangeRates.rateAndInvalid(_srcCurrencyKey);
        (uint256 destRate, ) = exchangeRates.rateAndInvalid(_destCurrencyKey);
        uint256 destAmount = _srcAmount.mul(srcRate).div(destRate);

        exchangeFeeRate_ = FEE;
        amountReceived_ = destAmount.mul(UNIT_FEE.sub(exchangeFeeRate_)).div(UNIT_FEE);
        fee_ = destAmount.sub(amountReceived_);

        return (amountReceived_, fee_, exchangeFeeRate_);
    }

    function setSynthFromCurrencyKeys(bytes32[] calldata _currencyKeys, address[] calldata _synths)
        external
        onlyOwner
    {
        // TODO: temporary removed to avoid stack too deep
        // require(
        //     _currencyKeys.length == _synths.length,
        //     "setSynthFromCurrencyKey: Unequal _currencyKeys and _synths lengths"
        // );
        for (uint256 i = 0; i < _currencyKeys.length; i++) {
            currencyKeyToSynth[_currencyKeys[i]] = _synths[i];
        }
    }

    function approveExchangeOnBehalf(address _delegate) external {
        authorizerToDelegateToApproval[msg.sender][_delegate] = true;
    }

    function __calculateAndSwap(
        address _exchangeForAddress,
        uint256 _srcAmount,
        bytes32 _srcCurrencyKey,
        bytes32 _destCurrencyKey
    ) private returns (uint256 amountReceived_) {
        MockSynthetixToken srcSynth = MockSynthetixToken(currencyKeyToSynth[_srcCurrencyKey]);
        MockSynthetixToken destSynth = MockSynthetixToken(currencyKeyToSynth[_destCurrencyKey]);

        require(address(srcSynth) != address(0), "__calculateAndSwap: Source synth is not listed");
        require(
            address(destSynth) != address(0),
            "__calculateAndSwap: Destination synth is not listed"
        );
        require(
            !srcSynth.isLocked(_exchangeForAddress),
            "__calculateAndSwap: Cannot settle during waiting period"
        );

        (amountReceived_, , ) = getAmountsForExchange(
            _srcAmount,
            _srcCurrencyKey,
            _destCurrencyKey
        );

        srcSynth.burnFrom(_exchangeForAddress, _srcAmount);
        destSynth.mintFor(_exchangeForAddress, amountReceived_);
        destSynth.lock(_exchangeForAddress);

        return amountReceived_;
    }

    function requireAndGetAddress(bytes32 _name, string calldata)
        external
        view
        returns (address resolvedAddress_)
    {
        if (_name == "ExchangeRates") {
            return EXCHANGE_RATES;
        }
        return address(this);
    }

    function settle(address, bytes32)
        external
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        // TODO
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function canExchangeFor(address, address) public pure returns (bool canExchange_) {
        return true;
    }

    function getExchangeRates() public view returns (address exchangeRates_) {
        return EXCHANGE_RATES;
    }

    function getFee() public view returns (uint256 fee_) {
        return FEE;
    }

    function getSynthFromCurrencyKey(bytes32 _currencyKey) public view returns (address synth_) {
        return currencyKeyToSynth[_currencyKey];
    }

    function getUnitFee() public pure returns (uint256 fee_) {
        return UNIT_FEE;
    }
}

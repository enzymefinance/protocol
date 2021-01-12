// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./../../release/interfaces/ISynthetixExchangeRates.sol";
import "../prices/CentralizedRateProvider.sol";
import "../tokens/MockSynthetixToken.sol";

/// @dev Synthetix Integratee. Mocks functionalities from the folllowing synthetix contracts
/// Synthetix, SynthetixAddressResolver, SynthetixDelegateApprovals
/// Link to contracts: <https://github.com/Synthetixio/synthetix/tree/develop/contracts>
contract MockSynthetixIntegratee is Ownable, MockToken {
    using SafeMath for uint256;

    mapping(address => mapping(address => bool)) private authorizerToDelegateToApproval;
    mapping(bytes32 => address) private currencyKeyToSynth;

    address private immutable CENTRALIZED_RATE_PROVIDER;
    address private immutable EXCHANGE_RATES;
    uint256 private immutable FEE;

    uint256 private constant UNIT_FEE = 1000;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _centralizedRateProvider,
        address _exchangeRates,
        uint256 _fee
    ) public MockToken(_name, _symbol, _decimals) {
        CENTRALIZED_RATE_PROVIDER = _centralizedRateProvider;
        EXCHANGE_RATES = address(_exchangeRates);
        FEE = _fee;
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
            canExchangeFor(_exchangeForAddress, msg.sender),
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
        returns (
            uint256 amountReceived_,
            uint256 fee_,
            uint256 exchangeFeeRate_
        )
    {
        address srcToken = currencyKeyToSynth[_srcCurrencyKey];
        address destToken = currencyKeyToSynth[_destCurrencyKey];

        require(
            currencyKeyToSynth[_srcCurrencyKey] != address(0) &&
                currencyKeyToSynth[_destCurrencyKey] != address(0),
            "getAmountsForExchange: Currency key doesn't have an associated synth"
        );

        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomizedBySender(srcToken, _srcAmount, destToken);

        exchangeFeeRate_ = FEE;
        amountReceived_ = destAmount.mul(UNIT_FEE.sub(exchangeFeeRate_)).div(UNIT_FEE);
        fee_ = destAmount.sub(amountReceived_);

        return (amountReceived_, fee_, exchangeFeeRate_);
    }

    function setSynthFromCurrencyKeys(bytes32[] calldata _currencyKeys, address[] calldata _synths)
        external
    {
        require(
            _currencyKeys.length == _synths.length,
            "setSynthFromCurrencyKey: Unequal _currencyKeys and _synths lengths"
        );
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
    {}

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function canExchangeFor(address _authorizer, address _delegate)
        public
        view
        returns (bool canExchange_)
    {
        return authorizerToDelegateToApproval[_authorizer][_delegate];
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

pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";
import "./KyberNetworkInterface.sol";
import "./Withdrawable.sol";
import "./Utils2.sol";
import "./WhiteListInterface.sol";
import "./ExpectedRateInterface.sol";
import "./FeeBurnerInterface.sol";


/**
 * @title Helps contracts guard against reentrancy attacks.
 */
contract ReentrancyGuard {

    /// @dev counter to allow mutex lock with only one SSTORE operation
    uint256 private guardCounter = 1;

    /**
     * @dev Prevents a function from calling itself, directly or indirectly.
     * Calling one `nonReentrant` function from
     * another is not supported. Instead, you can implement a
     * `private` function doing the actual work, and an `external`
     * wrapper marked as `nonReentrant`.
     */
    modifier nonReentrant() {
        guardCounter += 1;
        uint256 localCounter = guardCounter;
        _;
        require(localCounter == guardCounter);
    }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils2, KyberNetworkInterface, ReentrancyGuard {

    bytes public constant PERM_HINT = "PERM";
    uint  public constant PERM_HINT_GET_RATE = 1 << 255; // for get rate. bit mask hint.

    uint public negligibleRateDiff = 10; // basic rate steps will be in 0.01%
    KyberReserveInterface[] public reserves;
    mapping(address=>ReserveType) public reserveType;
    WhiteListInterface public whiteListContract;
    ExpectedRateInterface public expectedRateContract;
    FeeBurnerInterface    public feeBurnerContract;
    address               public kyberNetworkProxyContract;
    uint                  public maxGasPriceValue = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool                  public isEnabled = false; // network is enabled
    mapping(bytes32=>uint) public infoFields; // this is only a UI field for external app.

    mapping(address=>address[]) public reservesPerTokenSrc; //reserves supporting token to eth
    mapping(address=>address[]) public reservesPerTokenDest;//reserves support eth to token

    enum ReserveType {NONE, PERMISSIONED, PERMISSIONLESS}
    bytes internal constant EMPTY_HINT = "";

    function KyberNetwork(address _admin) public {
        require(_admin != address(0));
        admin = _admin;
    }

    event EtherReceival(address indexed sender, uint amount);

    /* solhint-disable no-complex-fallback */
    // To avoid users trying to swap tokens using default payable function. We added this short code
    //  to verify Ethers will be received only from reserves if transferred without a specific function call.
    function() public payable {
        require(reserveType[msg.sender] != ReserveType.NONE);
        EtherReceival(msg.sender, msg.value);
    }
    /* solhint-enable no-complex-fallback */

    struct TradeInput {
        address trader;
        ERC20 src;
        uint srcAmount;
        ERC20 dest;
        address destAddress;
        uint maxDestAmount;
        uint minConversionRate;
        address walletId;
        bytes hint;
    }

    function tradeWithHint(
        address trader,
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes hint
    )
        public
        nonReentrant
        payable
        returns(uint)
    {
        require(msg.sender == kyberNetworkProxyContract);
        require((hint.length == 0) || (hint.length == 4));

        TradeInput memory tradeInput;

        tradeInput.trader = trader;
        tradeInput.src = src;
        tradeInput.srcAmount = srcAmount;
        tradeInput.dest = dest;
        tradeInput.destAddress = destAddress;
        tradeInput.maxDestAmount = maxDestAmount;
        tradeInput.minConversionRate = minConversionRate;
        tradeInput.walletId = walletId;
        tradeInput.hint = hint;

        return trade(tradeInput);
    }

    event AddReserveToNetwork(KyberReserveInterface indexed reserve, bool add, bool isPermissionless);

    /// @notice can be called only by operator
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param isPermissionless is the new reserve from permissionless type.
    function addReserve(KyberReserveInterface reserve, bool isPermissionless) public onlyOperator
        returns(bool)
    {
        require(reserveType[reserve] == ReserveType.NONE);
        reserves.push(reserve);

        reserveType[reserve] = isPermissionless ? ReserveType.PERMISSIONLESS : ReserveType.PERMISSIONED;

        AddReserveToNetwork(reserve, true, isPermissionless);

        return true;
    }

    event RemoveReserveFromNetwork(KyberReserveInterface reserve);

    /// @notice can be called only by operator
    /// @dev removes a reserve from Kyber network.
    /// @param reserve The reserve address.
    /// @param index in reserve array.
    function removeReserve(KyberReserveInterface reserve, uint index) public onlyOperator
        returns(bool)
    {

        require(reserveType[reserve] != ReserveType.NONE);
        require(reserves[index] == reserve);

        reserveType[reserve] = ReserveType.NONE;
        reserves[index] = reserves[reserves.length - 1];
        reserves.length--;

        RemoveReserveFromNetwork(reserve);

        return true;
    }

    event ListReservePairs(address indexed reserve, ERC20 src, ERC20 dest, bool add);

    /// @notice can be called only by operator
    /// @dev allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserve The reserve address.
    /// @param token token address
    /// @param ethToToken will it support ether to token trade
    /// @param tokenToEth will it support token to ether trade
    /// @param add If true then list this pair, otherwise unlist it.
    function listPairForReserve(address reserve, ERC20 token, bool ethToToken, bool tokenToEth, bool add)
        public
        onlyOperator
        returns(bool)
    {
        require(reserveType[reserve] != ReserveType.NONE);

        if (ethToToken) {
            listPairs(reserve, token, false, add);

            ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        }

        if (tokenToEth) {
            listPairs(reserve, token, true, add);

            if (add) {
                require(token.approve(reserve, 2**255)); // approve infinity
            } else {
                require(token.approve(reserve, 0));
            }

            ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
        }

        setDecimals(token);

        return true;
    }

    event WhiteListContractSet(WhiteListInterface newContract, WhiteListInterface currentContract);

    ///@param whiteList can be empty
    function setWhiteList(WhiteListInterface whiteList) public onlyAdmin {
        WhiteListContractSet(whiteList, whiteListContract);
        whiteListContract = whiteList;
    }

    event ExpectedRateContractSet(ExpectedRateInterface newContract, ExpectedRateInterface currentContract);

    function setExpectedRate(ExpectedRateInterface expectedRate) public onlyAdmin {
        require(expectedRate != address(0));

        ExpectedRateContractSet(expectedRate, expectedRateContract);
        expectedRateContract = expectedRate;
    }

    event FeeBurnerContractSet(FeeBurnerInterface newContract, FeeBurnerInterface currentContract);

    function setFeeBurner(FeeBurnerInterface feeBurner) public onlyAdmin {
        require(feeBurner != address(0));

        FeeBurnerContractSet(feeBurner, feeBurnerContract);
        feeBurnerContract = feeBurner;
    }

    event KyberNetwrokParamsSet(uint maxGasPrice, uint negligibleRateDiff);

    function setParams(
        uint                  _maxGasPrice,
        uint                  _negligibleRateDiff
    )
        public
        onlyAdmin
    {
        require(_negligibleRateDiff <= 100 * 100); // at most 100%

        maxGasPriceValue = _maxGasPrice;
        negligibleRateDiff = _negligibleRateDiff;
        KyberNetwrokParamsSet(maxGasPriceValue, negligibleRateDiff);
    }

    event KyberNetworkSetEnable(bool isEnabled);

    function setEnable(bool _enable) public onlyAdmin {
        if (_enable) {
            require(feeBurnerContract != address(0));
            require(expectedRateContract != address(0));
            require(kyberNetworkProxyContract != address(0));
        }
        isEnabled = _enable;

        KyberNetworkSetEnable(isEnabled);
    }

    function setInfo(bytes32 field, uint value) public onlyOperator {
        infoFields[field] = value;
    }

    event KyberProxySet(address proxy, address sender);

    function setKyberProxy(address networkProxy) public onlyAdmin {
        require(networkProxy != address(0));
        kyberNetworkProxyContract = networkProxy;
        KyberProxySet(kyberNetworkProxyContract, msg.sender);
    }

    /// @dev returns number of reserves
    /// @return number of reserves
    function getNumReserves() public view returns(uint) {
        return reserves.length;
    }

    /// @notice should be called off chain
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() public view returns(KyberReserveInterface[]) {
        return reserves;
    }

    function maxGasPrice() public view returns(uint) {
        return maxGasPriceValue;
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint slippageRate)
    {
        require(expectedRateContract != address(0));
        bool includePermissionless = true;

        if (srcQty & PERM_HINT_GET_RATE > 0) {
            includePermissionless = false;
            srcQty = srcQty & ~PERM_HINT_GET_RATE;
        }

        return expectedRateContract.getExpectedRate(src, dest, srcQty, includePermissionless);
    }

    function getExpectedRateOnlyPermission(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint slippageRate)
    {
        require(expectedRateContract != address(0));
        return expectedRateContract.getExpectedRate(src, dest, srcQty, false);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        if (whiteListContract == address(0)) return (2 ** 255);
        return whiteListContract.getUserCapInWei(user);
    }

    function getUserCapInTokenWei(address user, ERC20 token) public view returns(uint) {
        //future feature
        user;
        token;
        require(false);
    }

    struct BestRateResult {
        uint rate;
        address reserve1;
        address reserve2;
        uint weiAmount;
        uint rateSrcToEth;
        uint rateEthToDest;
        uint destAmount;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev best conversion rate for a pair of tokens, if number of reserves have small differences. randomize
    /// @param src Src token
    /// @param dest Destination token
    /// @return obsolete - used to return best reserve index. not relevant anymore for this API.
    function findBestRate(ERC20 src, ERC20 dest, uint srcAmount) public view returns(uint obsolete, uint rate) {
        BestRateResult memory result = findBestRateTokenToToken(src, dest, srcAmount, EMPTY_HINT);
        return(0, result.rate);
    }

    function findBestRateOnlyPermission(ERC20 src, ERC20 dest, uint srcAmount)
        public
        view
        returns(uint obsolete, uint rate)
    {
        BestRateResult memory result = findBestRateTokenToToken(src, dest, srcAmount, PERM_HINT);
        return(0, result.rate);
    }

    function enabled() public view returns(bool) {
        return isEnabled;
    }

    function info(bytes32 field) public view returns(uint) {
        return infoFields[field];
    }

    /* solhint-disable code-complexity */
    // Regarding complexity. Below code follows the required algorithm for choosing a reserve.
    //  It has been tested, reviewed and found to be clear enough.
    //@dev this function always src or dest are ether. can't do token to token
    function searchBestRate(ERC20 src, ERC20 dest, uint srcAmount, bool usePermissionless)
        public
        view
        returns(address, uint)
    {
        uint bestRate = 0;
        uint bestReserve = 0;
        uint numRelevantReserves = 0;

        //return 1 for ether to ether
        if (src == dest) return (reserves[bestReserve], PRECISION);

        address[] memory reserveArr;

        reserveArr = src == ETH_TOKEN_ADDRESS ? reservesPerTokenDest[dest] : reservesPerTokenSrc[src];

        if (reserveArr.length == 0) return (reserves[bestReserve], bestRate);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);

        for (uint i = 0; i < reserveArr.length; i++) {
            //list all reserves that have this token.
            if (!usePermissionless && reserveType[reserveArr[i]] == ReserveType.PERMISSIONLESS) {
                continue;
            }

            rates[i] = (KyberReserveInterface(reserveArr[i])).getConversionRate(src, dest, srcAmount, block.number);

            if (rates[i] > bestRate) {
                //best rate is highest rate
                bestRate = rates[i];
            }
        }

        if (bestRate > 0) {
            uint smallestRelevantRate = (bestRate * 10000) / (10000 + negligibleRateDiff);

            for (i = 0; i < reserveArr.length; i++) {
                if (rates[i] >= smallestRelevantRate) {
                    reserveCandidates[numRelevantReserves++] = i;
                }
            }

            if (numRelevantReserves > 1) {
                //when encountering small rate diff from bestRate. draw from relevant reserves
                bestReserve = reserveCandidates[uint(block.blockhash(block.number-1)) % numRelevantReserves];
            } else {
                bestReserve = reserveCandidates[0];
            }

            bestRate = rates[bestReserve];
        }

        return (reserveArr[bestReserve], bestRate);
    }
    /* solhint-enable code-complexity */

    function findBestRateTokenToToken(ERC20 src, ERC20 dest, uint srcAmount, bytes hint) internal view
        returns(BestRateResult result)
    {
        //by default we use permission less reserves
        bool usePermissionless = true;

        // if hint in first 4 bytes == 'PERM' only permissioned reserves will be used.
        if ((hint.length >= 4) && (keccak256(hint[0], hint[1], hint[2], hint[3]) == keccak256(PERM_HINT))) {
            usePermissionless = false;
        }

        (result.reserve1, result.rateSrcToEth) =
            searchBestRate(src, ETH_TOKEN_ADDRESS, srcAmount, usePermissionless);

        result.weiAmount = calcDestAmount(src, ETH_TOKEN_ADDRESS, srcAmount, result.rateSrcToEth);

        (result.reserve2, result.rateEthToDest) =
            searchBestRate(ETH_TOKEN_ADDRESS, dest, result.weiAmount, usePermissionless);

        result.destAmount = calcDestAmount(ETH_TOKEN_ADDRESS, dest, result.weiAmount, result.rateEthToDest);

        result.rate = calcRateFromQty(srcAmount, result.destAmount, getDecimals(src), getDecimals(dest));
    }

    function listPairs(address reserve, ERC20 token, bool isTokenToEth, bool add) internal {
        uint i;
        address[] storage reserveArr = reservesPerTokenDest[token];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[token];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserve == reserveArr[i]) {
                if (add) {
                    break; //already added
                } else {
                    //remove
                    reserveArr[i] = reserveArr[reserveArr.length - 1];
                    reserveArr.length--;
                    break;
                }
            }
        }

        if (add && i == reserveArr.length) {
            //if reserve wasn't found add it
            reserveArr.push(reserve);
        }
    }

    event KyberTrade(address indexed trader, ERC20 src, ERC20 dest, uint srcAmount, uint dstAmount,
        address destAddress, uint ethWeiValue, address reserve1, address reserve2, bytes hint);

    /* solhint-disable function-max-lines */
    //  Most of the lines here are functions calls spread over multiple lines. We find this function readable enough
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param tradeInput structure of trade inputs
    function trade(TradeInput tradeInput) internal returns(uint) {
        require(isEnabled);
        require(tx.gasprice <= maxGasPriceValue);
        require(validateTradeInput(tradeInput.src, tradeInput.srcAmount, tradeInput.dest, tradeInput.destAddress));

        BestRateResult memory rateResult =
            findBestRateTokenToToken(tradeInput.src, tradeInput.dest, tradeInput.srcAmount, tradeInput.hint);

        require(rateResult.rate > 0);
        require(rateResult.rate < MAX_RATE);
        require(rateResult.rate >= tradeInput.minConversionRate);

        uint actualDestAmount;
        uint weiAmount;
        uint actualSrcAmount;

        (actualSrcAmount, weiAmount, actualDestAmount) = calcActualAmounts(tradeInput.src,
            tradeInput.dest,
            tradeInput.srcAmount,
            tradeInput.maxDestAmount,
            rateResult);

        require(getUserCapInWei(tradeInput.trader) >= weiAmount);
        require(handleChange(tradeInput.src, tradeInput.srcAmount, actualSrcAmount, tradeInput.trader));

        require(doReserveTrade(     //src to ETH
                tradeInput.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                this,
                weiAmount,
                KyberReserveInterface(rateResult.reserve1),
                rateResult.rateSrcToEth,
                true));

        require(doReserveTrade(     //Eth to dest
                ETH_TOKEN_ADDRESS,
                weiAmount,
                tradeInput.dest,
                tradeInput.destAddress,
                actualDestAmount,
                KyberReserveInterface(rateResult.reserve2),
                rateResult.rateEthToDest,
                true));

        if (tradeInput.src != ETH_TOKEN_ADDRESS) //"fake" trade. (ether to ether) - don't burn.
            require(feeBurnerContract.handleFees(weiAmount, rateResult.reserve1, tradeInput.walletId));
        if (tradeInput.dest != ETH_TOKEN_ADDRESS) //"fake" trade. (ether to ether) - don't burn.
            require(feeBurnerContract.handleFees(weiAmount, rateResult.reserve2, tradeInput.walletId));

        KyberTrade({
            trader: tradeInput.trader,
            src: tradeInput.src,
            dest: tradeInput.dest,
            srcAmount: actualSrcAmount,
            dstAmount: actualDestAmount,
            destAddress: tradeInput.destAddress,
            ethWeiValue: weiAmount,
            reserve1: (tradeInput.src == ETH_TOKEN_ADDRESS) ? address(0) : rateResult.reserve1,
            reserve2:  (tradeInput.dest == ETH_TOKEN_ADDRESS) ? address(0) : rateResult.reserve2,
            hint: tradeInput.hint
        });

        return actualDestAmount;
    }
    /* solhint-enable function-max-lines */

    function calcActualAmounts (ERC20 src, ERC20 dest, uint srcAmount, uint maxDestAmount, BestRateResult rateResult)
        internal view returns(uint actualSrcAmount, uint weiAmount, uint actualDestAmount)
    {
        if (rateResult.destAmount > maxDestAmount) {
            actualDestAmount = maxDestAmount;
            weiAmount = calcSrcAmount(ETH_TOKEN_ADDRESS, dest, actualDestAmount, rateResult.rateEthToDest);
            actualSrcAmount = calcSrcAmount(src, ETH_TOKEN_ADDRESS, weiAmount, rateResult.rateSrcToEth);
            require(actualSrcAmount <= srcAmount);
        } else {
            actualDestAmount = rateResult.destAmount;
            actualSrcAmount = srcAmount;
            weiAmount = rateResult.weiAmount;
        }
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param src Src token
    /// @param amount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param reserve Reserve to use
    /// @param validate If true, additional validations are applicable
    /// @return true if trade is successful
    function doReserveTrade(
        ERC20 src,
        uint amount,
        ERC20 dest,
        address destAddress,
        uint expectedDestAmount,
        KyberReserveInterface reserve,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        uint callValue = 0;

        if (src == dest) {
            //this is for a "fake" trade when both src and dest are ethers.
            if (destAddress != (address(this)))
                destAddress.transfer(amount);
            return true;
        }

        if (src == ETH_TOKEN_ADDRESS) {
            callValue = amount;
        }

        // reserve sends tokens/eth to network. network sends it to destination
        require(reserve.trade.value(callValue)(src, amount, dest, this, conversionRate, validate));

        if (destAddress != address(this)) {
            //for token to token dest address is network. and Ether / token already here...
            if (dest == ETH_TOKEN_ADDRESS) {
                destAddress.transfer(expectedDestAmount);
            } else {
                require(dest.transfer(destAddress, expectedDestAmount));
            }
        }

        return true;
    }

    /// when user sets max dest amount we could have too many source tokens == change. so we send it back to user.
    function handleChange (ERC20 src, uint srcAmount, uint requiredSrcAmount, address trader) internal returns (bool) {

        if (requiredSrcAmount < srcAmount) {
            //if there is "change" send back to trader
            if (src == ETH_TOKEN_ADDRESS) {
                trader.transfer(srcAmount - requiredSrcAmount);
            } else {
                require(src.transfer(trader, (srcAmount - requiredSrcAmount)));
            }
        }

        return true;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @return true if tradeInput is valid
    function validateTradeInput(ERC20 src, uint srcAmount, ERC20 dest, address destAddress)
        internal
        view
        returns(bool)
    {
        require(srcAmount <= MAX_QTY);
        require(srcAmount != 0);
        require(destAddress != address(0));
        require(src != dest);

        if (src == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
            //funds should have been moved to this contract already.
            require(src.balanceOf(this) >= srcAmount);
        }

        return true;
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IFundValueCalculatorRouter} from "tests/interfaces/internal/IFundValueCalculatorRouter.sol";
import {IGlobalConfigLib} from "tests/interfaces/internal/IGlobalConfigLib.sol";
import {IProtocolFeeReserveLib} from "tests/interfaces/internal/IProtocolFeeReserveLib.sol";
import {IUintListRegistry} from "tests/interfaces/internal/IUintListRegistry.sol";

struct Contracts {
    IAddressListRegistry addressListRegistry;
    IDispatcher dispatcher;
    IExternalPositionFactory externalPositionFactory;
    IFundValueCalculatorRouter fundValueCalculatorRouter;
    IGlobalConfigLib globalConfigProxy;
    IProtocolFeeReserveLib protocolFeeReserveProxy;
    IUintListRegistry uintListRegistry;
}

function getMainnetDeployment() pure returns (Contracts memory) {
    return Contracts({
        addressListRegistry: IAddressListRegistry(0x4eb4c7Babfb5d54ab4857265B482Fb6512d22DFF),
        dispatcher: IDispatcher(0xC3DC853dD716bd5754f421ef94fdCbac3902ab32),
        externalPositionFactory: IExternalPositionFactory(0x0AAcb782205dde9eFf4862ACe9849DcE1ca3409f),
        fundValueCalculatorRouter: IFundValueCalculatorRouter(0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9),
        globalConfigProxy: IGlobalConfigLib(0x5611dF74A77EfD198De5Fc7f83A482DcFE0c7A7A),
        protocolFeeReserveProxy: IProtocolFeeReserveLib(0xB7460593BD222E24a2bF4393aa6416bD373995E0),
        uintListRegistry: IUintListRegistry(0x6FfD6fC068E7b365AF18dA4fdC39D3289159407B)
    });
}

function getPolygonDeployment() pure returns (Contracts memory) {
    return Contracts({
        addressListRegistry: IAddressListRegistry(0x5AE15bF655a8f42b9C7D93E64f4476ec1DA248f8),
        dispatcher: IDispatcher(0x2e25271297537B8124b8f883a92fFd95C4032733),
        externalPositionFactory: IExternalPositionFactory(0x067eEEa753aba0DDeCCa0b80BBB8b7572bf6580D),
        fundValueCalculatorRouter: IFundValueCalculatorRouter(0xD70389a7d6171e1DBA6C3df4DB7331811fd93f08),
        globalConfigProxy: IGlobalConfigLib(0xcbbD50255Cf49797BaDB28cE625a4ea217C67A64),
        protocolFeeReserveProxy: IProtocolFeeReserveLib(0xF0BFEE2A93B0A1F9C5f6C1d731a6cf1308d68b2D),
        uintListRegistry: IUintListRegistry(0x6DdD871C1607348eBb5BE250F882255390166519)
    });
}

function getArbitrumDeployment() pure returns (Contracts memory contracts_) {
    return Contracts({
        addressListRegistry: IAddressListRegistry(0x2C6bef68DAbf0494bB5F727E63c8FB54f7D2c287),
        dispatcher: IDispatcher(0x8da28441a4c594fD2fac72726C1412d8Cf9E4A19),
        externalPositionFactory: IExternalPositionFactory(0xD44256aCea2193D4A50a9Ad879a531666729962c),
        fundValueCalculatorRouter: IFundValueCalculatorRouter(0x2e58f80cea88F0787CAdf1bB30acC23d8Ac81982),
        globalConfigProxy: IGlobalConfigLib(0xf9315B421904eADF2f8FCe776958c147Ee9bC880),
        protocolFeeReserveProxy: IProtocolFeeReserveLib(0x9Eb802e7696C9951fdCbA90699e5000D7A39205c),
        uintListRegistry: IUintListRegistry(0xC438E48F5D2F99eb4a2b9865F8cccfC9915f227A)
    });
}

function getBaseChainDeployment() pure returns (Contracts memory contracts_) {
    return Contracts({
        addressListRegistry: IAddressListRegistry(0x42232ff4F38639ED942e0C76723e76e1A0588899),
        dispatcher: IDispatcher(0xD79FCD6eb56115f9757EC4C90fc2C5D143f83C16),
        externalPositionFactory: IExternalPositionFactory(0x097C44Da5E720641a60c2C438C0C921D28968a00),
        fundValueCalculatorRouter: IFundValueCalculatorRouter(0xB17403bcBcCC3B74FA7491e38913dD36F1b9F402),
        globalConfigProxy: IGlobalConfigLib(0x65b8f1f82CE8a6b72Db0937c522A52Af5693D4d3),
        protocolFeeReserveProxy: IProtocolFeeReserveLib(0x410F5bC40668b729675DACB48A3467861Bb36C50),
        uintListRegistry: IUintListRegistry(0x305357dBb4f4A65601751eb25D275Ad071466CD2)
    });
}

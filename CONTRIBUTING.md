# Melon Contribution Guidelines

As an open source project, we will consider changes to the code base from the community via pull requests. This document contains the guidelines for submission.

## Pull requests and reviews

The main branch that development work occurs on is the `develop` branch. It is usually encouraged to branch from there, and make pull requests back to `develop` when the change is made.

When making a pull request, please:
- follow the "Git Branching Model" outlined in this document
- follow the "Styleguide" outlined in this document
- add tests that cover newly introduced code
- make a comment in the pull request that includes any breaking changes to solidity code
- make the pull request against the `develop` branch

When a pull request is created, one of the maintainers will review the code, and incorporate it into the relevant branch.

## Git Branching Model

Please always make PRs into the `develop` branch.

We follow this [Git branching model](http://nvie.com/posts/a-successful-git-branching-model/).

Each branch name should be prefixed with either `feature/`, `fix/`, `refactor/`, or `chore/` depending on the type of work that is being done:
- `feature/my-branch` (for code that adds functionality)
- `fix/my-branch` (for fixing existing code)
- `refactor/my-branch` (for refactoring production code)
- `chore/my-branch` (for updating linters, documentation, etc)

The branch name should end with the Github issue number (where applicable):
- e.g., `feature/my-feature-#123` refers to issue #123.

## Styleguide

The purpose of this style guide is to increase consistency within and between our contracts.
This makes them more legible, thereby helping maintain a high level of security.

### Tools

Some of our style choices are enforceable by a linter.

Using a linter is not a substitute for understanding the style guide, however, since some of our style choices do not have rules that can be enforced by these linters yet.

#### Solhint

We use [solhint](https://github.com/protofire/solhint) for linting Solidity code. We extend solhint's [recommended rules](https://github.com/protofire/solhint/blob/master/docs/rules.md) with a few of our own, which can be found in `.solhint.json`.

#### ESLint

We will soon be implementing [ESLint](https://eslint.org/) for the javascript (e.g., tests, deployment scripts, utils) in the repo.

### Solidity

Please adhere to the recommended [official Solidity style guide for v0.5.13](https://solidity.readthedocs.io/en/v0.5.13/style-guide.html), in addition to the following styling choices:

#### Namespacing

- function, modifier, and event _parameters_ are _prefixed_ with an underscore, e.g., `_myParameter`
- function, modifier, and event _return values_ are _suffixed_ with an underscore, e.g., `myReturnValue_`
- An `interface` for a contract should be prefixed with an `I`, e.g., `IMyContract`

#### Layout

- Max line length: 99
- Functions longer than 99 characters should be laid out as in the following example adapted from the Solidity style guide:

```solidity
function thisFunctionNameIsReallyLong(address _x, address _y, address _z)
    public
    onlyowner
    priced
    returns (address a_)
{
    doSomething();
}
```

#### Natspec comments

We use [Natspec](https://github.com/ethereum/wiki/wiki/Ethereum-Natural-Specification-Format) annotations for our visible functions (i.e., `external` and `public`), which can be parsed to generate documentation.

```solidity
/**
@notice Send tokens to another address, and get back the balances before/after balances
@param toAddress The address to receive funds
@return {
    "oldBalance": "The balance before sending funds",
    "newBalance": "The balance after sending funds"
}
*/
function sendFunds(address toAddress)
    returns (uint oldBalance, uint newBalance)
{
    ...
}
```

#### Misc

- `require()` statements must include a helpful message
- data types should be explicitly defined, e.g., `uint256` instead of `uint`

Should there no explicitly mentioned rule please follow the _[GOLDEN RULE](https://github.com/ethereum/cpp-ethereum/blob/b6218fc1da39994043f1c43185bb24e364382d84/CodingStandards.txt#L3): Follow the style of the existing code when you make changes._

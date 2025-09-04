# Enzyme Protocol Contribution Guidelines

As an open source project, we will consider changes to the code base from the community via pull requests. This document contains the guidelines for submission.

## Requesting Permission to Contribute

Currently, all active development happens in a private development repo, which is then pushed to the public repo as releases and extended functionality are brought into production.

We are working on a structure for general community contributions.

In the meantime, those who wish to contribute to Enzyme should reach out to the Enzyme Council with a proposal for how they would like to contribute: [security@enzyme.finance](mailto:security@enzyme.finance)

All pull requests must be made against the private development repo.

## Git Branching Model

We essentially follow the principles of this [Git branching model](http://nvie.com/posts/a-successful-git-branching-model/).

Because releases are dependent on deployed smart contracts, the only kinds of code that can be merged directly into branches of already-deployed releases are contracts that do not depend on changes to already-deployed production code (e.g., a new DeFi adapter or a new derivative price feed), or changes to non-production code (e.g., docs or additional test coverage necessary to accompany new contracts).

Each branch name should be prefixed with either `feat/`, `fix/`, `refactor/`, `chore/`, `test/`, or `docs/` depending on the type of work that is being done:

- `feat/my-branch` (for code that adds new contract functionality, production contracts only)
- `fix/my-branch` (for fixing existing contracts, production contracts only)
- `refactor/my-branch` (for refactoring contracts, production contracts only)
- `chore/my-branch` (for any work on non-production contracts, linters, deployment utils, etc)
- `test/my-branch` (for adding, fixing, or updating tests and test helpers)
- `docs/my-branch` (for documentation additions or changes)

## Issues, Pull Requests and Reviews

Anybody can open a new issue, which will be reviewed by a maintainer.

When making a pull request (PR), please:

- Follow the "Git Branching Model" outlined in this document
- Follow the [Style Guide](/STYLE.md)
- Add tests that cover newly introduced code
- Format your code by running `make format`
- Lint your code by running `make lint`
- Write a thorough description about the purpose and implementation of the PR
- Make a comment in the PR that includes any breaking changes to solidity code

When a pull request is created, one of the maintainers will review the code, and incorporate it into the relevant branch.

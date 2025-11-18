# GitHub Actions Badges

Add these to your README files for visual status indicators.

## Main README.md (Root)

```markdown
![CI](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CI/badge.svg)
![Release](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/Release/badge.svg)
![CodeQL](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CodeQL%20Security%20Analysis/badge.svg)
[![codecov](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy/branch/main/graph/badge.svg)](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
```

## Package-Specific Badges

### MCP Backend (packages/mcp/README.md)

```markdown
[![MCP Tests](https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy/branch/main/graph/badge.svg?flag=mcp)](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy)
[![npm version](https://img.shields.io/npm/v/bc-telemetry-buddy-mcp.svg)](https://www.npmjs.com/package/bc-telemetry-buddy-mcp)
```

### VSCode Extension (packages/extension/README.md)

```markdown
[![Extension Tests](https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy/branch/main/graph/badge.svg?flag=extension)](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/waldoBC.bc-telemetry-buddy.svg)](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy)
[![VS Code Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/waldoBC.bc-telemetry-buddy.svg)](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy)
[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/waldoBC.bc-telemetry-buddy.svg)](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy)
```

## Additional Badges

### Quality Badges

```markdown
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)
```

### Community Badges

```markdown
[![GitHub issues](https://img.shields.io/github/issues/waldo1001/waldo.BCTelemetryBuddy.svg)](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/waldo1001/waldo.BCTelemetryBuddy.svg)](https://github.com/waldo1001/waldo.BCTelemetryBuddy/pulls)
[![GitHub stars](https://img.shields.io/github/stars/waldo1001/waldo.BCTelemetryBuddy.svg?style=social)](https://github.com/waldo1001/waldo.BCTelemetryBuddy/stargazers)
```

### Dependency Badges

```markdown
[![Dependencies](https://img.shields.io/librariesio/github/waldo1001/waldo.BCTelemetryBuddy.svg)](https://libraries.io/github/waldo1001/waldo.BCTelemetryBuddy)
[![Known Vulnerabilities](https://snyk.io/test/github/waldo1001/waldo.BCTelemetryBuddy/badge.svg)](https://snyk.io/test/github/waldo1001/waldo.BCTelemetryBuddy)
```

## Status Indicators

### Build Status

- ![Passing](https://img.shields.io/badge/build-passing-brightgreen.svg) - All tests pass
- ![Failing](https://img.shields.io/badge/build-failing-red.svg) - Tests failing
- ![Unknown](https://img.shields.io/badge/build-unknown-lightgrey.svg) - No recent builds

### Coverage

- ![Coverage 100%](https://img.shields.io/badge/coverage-100%25-brightgreen.svg) - Perfect coverage
- ![Coverage 70%](https://img.shields.io/badge/coverage-70%25-yellow.svg) - Meets threshold
- ![Coverage 50%](https://img.shields.io/badge/coverage-50%25-red.svg) - Below threshold

## Customization

Replace `waldo1001` with your GitHub username and `waldo.bc-telemetry-buddy` with your VS Code Marketplace publisher/extension ID.

For custom badges, use [shields.io](https://shields.io/).

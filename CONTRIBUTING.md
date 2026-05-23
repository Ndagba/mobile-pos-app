# Contributing to Mobile POS

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the Mobile POS project.

## 📋 Code of Conduct

Please be respectful and professional in all interactions. We're committed to providing a welcoming environment for all contributors.

## 🚀 Getting Started

### 1. Fork & Clone
```bash
# Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/mobile-pos.git
cd mobile-pos
git remote add upstream https://github.com/Ndagba/mobile-pos.git
```

### 2. Create a Branch
```bash
# Always branch from develop
git fetch upstream
git checkout -b feature/your-feature-name upstream/develop
```

### 3. Install Dependencies
```bash
# Backend
cd backend && npm install && cd ..

# Mobile
cd mobile && npm install && cd ..
```

## 📝 Development Workflow

### Code Style
- **TypeScript**: Strict mode enabled
- **Format**: Prettier (auto-formatted on commit)
- **Linting**: ESLint enforced
- **Naming**: camelCase for variables/functions, PascalCase for types/components

### Commit Messages
Follow conventional commits:
```
feat: add biometric authentication flow
fix: resolve offline sync race condition
docs: update setup instructions
refactor: simplify transaction service
test: add unit tests for tax calculation
```

### Running Tests
```bash
# Unit tests
cd backend && npm test
cd ../mobile && npm test

# Integration tests
npm run test:integration

# Coverage
npm run test:coverage
```

### Before Submitting

```bash
# 1. Pull latest upstream
git fetch upstream
git rebase upstream/develop

# 2. Run linter
npm run lint

# 3. Format code
npm run format

# 4. Run tests
npm test

# 5. Test the app manually
# Start backend and mobile, test your changes
```

## 🎯 Pull Request Process

### 1. Push Your Branch
```bash
git push origin feature/your-feature-name
```

### 2. Open Pull Request on GitHub
- **Title**: Use conventional commit format
- **Description**: Include:
  - What problem does this solve?
  - How does it solve it?
  - Screenshots (for UI changes)
  - Testing done
  - Checklist:
    - [ ] Tests pass
    - [ ] Code formatted
    - [ ] Documentation updated
    - [ ] No breaking changes

### 3. Code Review
- Maintainers will review within 2-3 days
- Address feedback and push new commits
- Get 2 approvals before merge

### 4. Merge
- Squash commits into a single commit
- Use conventional commit message
- Delete feature branch

## 🐛 Bug Reports

### Before Reporting
1. Check existing issues to avoid duplicates
2. Verify bug is reproducible

### Report Format
```
**Title**: [Bug] Brief description

**Reproduction Steps**:
1. Step 1
2. Step 2
3. Step 3

**Expected**: What should happen
**Actual**: What actually happened

**Environment**:
- Device: iPhone 15 / Pixel 7 / Emulator
- OS: iOS 17.1 / Android 14
- App Version: 1.0.0
- Network: WiFi / Cellular / Offline

**Logs**:
[Paste error logs here]

**Screenshots**: [Attach if applicable]
```

## 💡 Feature Requests

Use this format:
```
**Feature**: Brief title

**Problem**: What problem does this solve?

**Solution**: How would you solve it?

**Use Case**: Why is this important?

**Examples**: Real-world examples
```

## 📂 Project Structure Guide

### Backend (`/backend`)
```
src/
├── api/routes/          # API endpoints
├── services/            # Business logic
├── middleware/          # Express middleware
├── utils/               # Helpers
├── validators/          # Input validation
└── index.ts             # Express app
```

### Mobile (`/mobile`)
```
src/
├── screens/             # Full-page components
├── components/          # Reusable components
├── services/            # API, DB, Sync logic
├── redux/               # State management
├── theme/               # Design tokens
├── hooks/               # Custom hooks
├── utils/               # Helpers
└── App.tsx              # Root component
```

## 🔍 Architecture Decisions

### When Making Changes
1. Keep components focused (single responsibility)
2. Use TypeScript strictly
3. Avoid deeply nested code
4. Keep functions under 50 lines
5. Add comments for complex logic
6. Use semantic variable names

### Dependencies
- **Adding new packages?** 
  - Discuss in issue first
  - Check bundle size impact
  - Prefer well-maintained libraries
  - Update both `package.json` files

### Database Changes
- Create a Prisma migration
- Test migration up and down
- Document breaking changes
- Add seed data if needed

## 🧪 Testing Requirements

### Unit Tests
- Test business logic (services)
- Test utility functions
- Mock external dependencies
- Aim for 80%+ coverage

### Integration Tests
- Test complete workflows
- Use real database for tests
- Test offline sync
- Test error cases

### Manual Testing
- Test on device if possible
- Test offline mode
- Test edge cases
- Verify permissions work

## 📚 Documentation Standards

### Code Comments
```typescript
// ❌ Avoid obvious comments
const x = 5; // Set x to 5

// ✅ Explain WHY, not WHAT
const RETRY_ATTEMPTS = 5; // Empirically determined: higher fails to reconnect, lower loses transactions
```

### JSDoc for Complex Functions
```typescript
/**
 * Calculates tax with HST/IGST handling
 * @param amount - Pre-tax amount in paise
 * @param taxRate - Tax rate (0-100)
 * @returns Tax amount in paise, rounded to nearest paise
 */
function calculateTax(amount: number, taxRate: number): number {
  // ...
}
```

### API Documentation
Document endpoint changes in a comment:
```typescript
/**
 * POST /transactions
 * @body { items: [], paymentMethod: string, customerId?: string }
 * @returns { transactionId, offline_session_hash?, status }
 */
router.post('/transactions', asyncHandler(createTransaction));
```

## 🚀 Release Process

1. Bump version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. Create GitHub release
6. Build and publish to app stores

## ❓ Questions?

- Check `ARCHITECTURE.md` for design decisions
- Read `IMPLEMENTATION_GUIDE.md` for workflows
- Open a Discussion on GitHub
- Check existing Issues for similar questions

## Thank You! 🙏

Your contributions help make Mobile POS better for everyone. We appreciate your time and effort!

---

**Happy coding! 💻**

# Deployment Guide

This guide covers the deployment process for the Nevent SDKs to our CDN infrastructure (AWS S3 + CloudFront).

## Table of Contents

- [Overview](#overview)
- [Automatic Deployment (CI/CD)](#automatic-deployment-cicd)
- [Manual Deployment (Emergency)](#manual-deployment-emergency)
- [Rollback Procedure](#rollback-procedure)
- [Required GitHub Secrets](#required-github-secrets)
- [Versioning Strategy](#versioning-strategy)
- [Breaking Changes](#breaking-changes)

## Overview

The Nevent SDKs are deployed to a global CDN for easy integration via `<script>` tags. We maintain two environments:

| Environment | Domain | Branch | Purpose |
|-------------|--------|--------|---------|
| Development | `dev.neventapps.com` | `development` | Testing and QA |
| Production | `neventapps.com` | `main` | Public-facing releases |

### URL Structure

```
https://{domain}/subs/v{VERSION}/nevent-subscriptions.{format}
https://{domain}/subs/latest/nevent-subscriptions.{format}
```

**Examples:**
- `https://neventapps.com/subs/v2.0.0/nevent-subscriptions.umd.cjs` (versioned, immutable)
- `https://neventapps.com/subs/latest/nevent-subscriptions.umd.cjs` (mutable, auto-updates)

## Automatic Deployment (CI/CD)

Deployments are fully automated via GitHub Actions. No manual intervention required.

### Development Deployment

**Trigger:** Push to `development` branch

**Process:**
1. Workflow: `.github/workflows/deploy-dev.yml`
2. Build packages with `npm run build`
3. Extract version from `packages/subscriptions/package.json`
4. Upload to S3:
   - Versioned path: `s3://dev-nevent-sdks/subs/v{VERSION}/`
   - Latest alias: `s3://dev-nevent-sdks/subs/latest/`
5. Invalidate CloudFront cache for `/subs/latest/*`
6. Post deployment summary with CDN URLs

**Cache headers:**
- Versioned files: `cache-control: public, max-age=31536000, immutable` (1 year)
- Latest alias: `cache-control: public, max-age=300` (5 minutes)

**Deployment URL:** `https://dev.neventapps.com/subs/`

### Production Deployment

**Trigger:** Push to `main` branch

**Process:**
1. Workflow: `.github/workflows/deploy-prod.yml`
2. Build packages with `npm run build`
3. Extract version from `packages/subscriptions/package.json`
4. **Check if version already exists** (prevents overwrites)
   - If exists: Workflow fails with error message
   - If new: Proceed with deployment
5. Upload to S3:
   - Versioned path: `s3://prd-nevent-sdks/subs/v{VERSION}/`
   - Latest alias: `s3://prd-nevent-sdks/subs/latest/`
6. Invalidate CloudFront cache for `/subs/latest/*`
7. Create GitHub Release with:
   - Tag: `v{VERSION}`
   - Release notes with CDN URLs
   - Integration examples
8. Post deployment summary

**Deployment URL:** `https://neventapps.com/subs/`

### Workflow Diagram

```
development branch
    │
    ├─> Push to development
    │       │
    │       ├─> Build SDK
    │       ├─> Deploy to S3 (dev)
    │       ├─> Invalidate CloudFront
    │       └─> ✅ https://dev.neventapps.com/subs/
    │
    ├─> PR to main (after testing)
    │       │
    │       └─> Human review required
    │
main branch
    │
    ├─> Merge PR
    │       │
    │       ├─> Build SDK
    │       ├─> Check version uniqueness
    │       ├─> Deploy to S3 (prod)
    │       ├─> Invalidate CloudFront
    │       ├─> Create GitHub Release
    │       └─> ✅ https://neventapps.com/subs/
```

## Manual Deployment (Emergency)

Use manual deployment ONLY in emergency situations when CI/CD is unavailable.

### Prerequisites

1. AWS CLI installed and configured
2. Valid AWS credentials with S3 and CloudFront permissions
3. CloudFront distribution IDs

### Deploy to Development

```bash
# Navigate to repo root
cd /path/to/nev-sdks

# Build packages
npm run build

# Extract version
VERSION=$(node -p "require('./packages/subscriptions/package.json').version")
echo "Deploying version: $VERSION"

# Upload versioned files (immutable)
aws s3 sync packages/subscriptions/dist/ \
  s3://dev-nevent-sdks/subs/v${VERSION}/ \
  --region eu-west-1 \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

# Update latest alias (mutable)
aws s3 sync packages/subscriptions/dist/ \
  s3://dev-nevent-sdks/subs/latest/ \
  --region eu-west-1 \
  --delete \
  --cache-control "public, max-age=300"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/subs/latest/*"

echo "✅ Deployed to https://dev.neventapps.com/subs/v${VERSION}/"
```

### Deploy to Production

```bash
# Same as dev but use production bucket
VERSION=$(node -p "require('./packages/subscriptions/package.json').version")

# Check if version exists (manual check)
aws s3 ls s3://prd-nevent-sdks/subs/v${VERSION}/
# If command returns files, STOP! Version already exists.

# Upload versioned files
aws s3 sync packages/subscriptions/dist/ \
  s3://prd-nevent-sdks/subs/v${VERSION}/ \
  --region eu-west-1 \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

# Update latest alias
aws s3 sync packages/subscriptions/dist/ \
  s3://prd-nevent-sdks/subs/latest/ \
  --region eu-west-1 \
  --delete \
  --cache-control "public, max-age=300"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E0987654321XYZ \
  --paths "/subs/latest/*"

echo "✅ Deployed to https://neventapps.com/subs/v${VERSION}/"

# Create GitHub Release manually
gh release create v${VERSION} \
  --title "Release v${VERSION}" \
  --notes "See DEPLOYMENT.md for CDN URLs"
```

## Rollback Procedure

If a deployment introduces issues, you can rollback the `/latest/` alias to a previous version.

### Rollback Latest Alias

```bash
# Identify the last known good version
GOOD_VERSION="2.0.0"

# Copy old version to latest (development)
aws s3 sync s3://dev-nevent-sdks/subs/v${GOOD_VERSION}/ \
  s3://dev-nevent-sdks/subs/latest/ \
  --region eu-west-1 \
  --delete \
  --cache-control "public, max-age=300"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/subs/latest/*"

echo "✅ Rolled back /latest/ to v${GOOD_VERSION}"
```

**For production:**
```bash
aws s3 sync s3://prd-nevent-sdks/subs/v${GOOD_VERSION}/ \
  s3://prd-nevent-sdks/subs/latest/ \
  --region eu-west-1 \
  --delete \
  --cache-control "public, max-age=300"

aws cloudfront create-invalidation \
  --distribution-id E0987654321XYZ \
  --paths "/subs/latest/*"
```

### Important Notes

- Versioned URLs (e.g., `/v2.0.0/`) are **immutable** and cannot be rolled back
- Only `/latest/` can be rolled back
- Users loading from versioned URLs are unaffected by rollbacks
- Always communicate rollbacks to stakeholders

## Required GitHub Secrets

Configure these secrets in your GitHub repository settings:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | IAM user access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `CLOUDFRONT_DEV_DISTRIBUTION_ID` | Dev CloudFront distribution | `E1234567890ABC` |
| `CLOUDFRONT_PROD_DISTRIBUTION_ID` | Prod CloudFront distribution | `E0987654321XYZ` |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions | (automatic) |

### IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::dev-nevent-sdks/*",
        "arn:aws:s3:::prd-nevent-sdks/*",
        "arn:aws:s3:::dev-nevent-sdks",
        "arn:aws:s3:::prd-nevent-sdks"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "*"
    }
  ]
}
```

## Versioning Strategy

We follow [Semantic Versioning (SemVer)](https://semver.org/):

### Version Types

| Type | Example | Use Case | Breaking? |
|------|---------|----------|-----------|
| **Patch** | 2.0.0 → 2.0.1 | Bug fixes | No |
| **Minor** | 2.0.0 → 2.1.0 | New features | No |
| **Major** | 2.0.0 → 3.0.0 | Breaking changes | Yes |

### Creating a Version

```bash
# Create a changeset
npm run changeset

# Follow the prompts:
# 1. Select packages to version (use space to select)
# 2. Choose version bump type (patch/minor/major)
# 3. Write a summary of changes

# Commit the changeset
git add .changeset/
git commit -m "chore: add changeset for feature X"
git push
```

### Version Bump Process

1. **Development:**
   ```bash
   # Merge PR with changeset to development
   # Test on dev.neventapps.com
   ```

2. **Production:**
   ```bash
   # Create PR from development to main
   # Changesets will bump version automatically
   # Merge triggers deployment to neventapps.com
   ```

## Breaking Changes

When releasing a major version (e.g., v3.0.0), follow this process:

### 1. Plan Migration (T-6 months)

- Document all breaking changes in `MIGRATION.md`
- Create migration guide with code examples
- Communicate timeline to users via:
  - GitHub Discussions
  - Email to registered users
  - Banner on documentation site

### 2. Parallel Support (T-3 months)

- Maintain both versions in CDN:
  - `https://neventapps.com/subs/v2-latest/` (old version)
  - `https://neventapps.com/subs/v3-latest/` (new version)
  - `https://neventapps.com/subs/latest/` (points to v3)

### 3. Deprecation (T-0 months)

- Release v3.0.0 to production
- Update `/latest/` to point to v3
- Continue security patches for v2.x for 12 months

### 4. End-of-Life (T+12 months)

- Stop v2.x security patches
- Keep v2.x files available (immutable versioned URLs)
- Remove `/v2-latest/` alias

### Example Timeline

```
Month 0: Release v3.0.0
    ├─> /subs/v3.0.0/ (immutable)
    ├─> /subs/v3-latest/ (mutable, v3.x)
    ├─> /subs/latest/ (mutable, points to v3.x)
    └─> /subs/v2-latest/ (mutable, v2.x security patches)

Month 12: End v2.x support
    ├─> /subs/v2.0.0/ (still available, immutable)
    ├─> /subs/v2.1.0/ (still available, immutable)
    └─> Remove /subs/v2-latest/ (deprecated)
```

## Deployment Checklist

### Before Deployment

- [ ] All tests passing (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Changeset created (`npm run changeset`)
- [ ] PR reviewed and approved
- [ ] Version bump is correct (patch/minor/major)

### Development Deployment

- [ ] Push to `development` branch
- [ ] Verify workflow completes successfully
- [ ] Test on `https://dev.neventapps.com/subs/latest/`
- [ ] Verify version-specific URL works
- [ ] Check browser console for errors
- [ ] Test on multiple browsers

### Production Deployment

- [ ] Development deployment tested successfully
- [ ] Create PR from `development` to `main`
- [ ] PR reviewed and approved
- [ ] Merge to `main`
- [ ] Verify workflow completes successfully
- [ ] Check GitHub Release created
- [ ] Test on `https://neventapps.com/subs/latest/`
- [ ] Verify version-specific URL works
- [ ] Monitor error rates (Sentry, CloudWatch)
- [ ] Update documentation if needed

### Post-Deployment

- [ ] Verify CloudFront cache invalidation completed
- [ ] Test integration in example applications
- [ ] Monitor user-facing metrics
- [ ] Announce release (GitHub, email, Slack)
- [ ] Update changelog
- [ ] Close related issues/PRs

## Monitoring

### Verify Deployment

```bash
# Check dev deployment
curl -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs

# Check prod deployment
curl -I https://neventapps.com/subs/v2.0.0/nevent-subscriptions.umd.cjs

# Verify cache headers
# Should see: cache-control: public, max-age=31536000, immutable (versioned)
# Should see: cache-control: public, max-age=300 (latest)
```

### CloudWatch Metrics

Monitor these CloudFront metrics:
- **Requests:** Total number of requests
- **BytesDownloaded:** Bandwidth usage
- **4xxErrorRate:** Client errors
- **5xxErrorRate:** Server errors
- **CacheHitRate:** CDN efficiency

### Sentry Integration

Track client-side errors:
- SDK initialization failures
- API request errors
- Widget rendering errors

## Troubleshooting

### Deployment Fails: Version Already Exists

**Error:**
```
ERROR: Version 2.0.0 already exists in production!
```

**Solution:**
1. Update version in `packages/subscriptions/package.json`
2. Create new changeset: `npm run changeset`
3. Commit and push

### CloudFront Cache Not Invalidating

**Symptoms:** Old version still served from `/latest/`

**Solution:**
```bash
# Manual invalidation
aws cloudfront create-invalidation \
  --distribution-id E0987654321XYZ \
  --paths "/subs/latest/*"

# Wait 5-10 minutes for propagation
# Verify with:
curl -I https://neventapps.com/subs/latest/nevent-subscriptions.umd.cjs
```

### Files Not Found (404)

**Symptoms:** `curl` returns 404 for CDN URLs

**Solution:**
1. Verify S3 bucket has files:
   ```bash
   aws s3 ls s3://prd-nevent-sdks/subs/v2.0.0/
   ```

2. Check CloudFront origin settings (AWS Console)
3. Verify bucket policy allows CloudFront access

### CORS Errors

**Symptoms:** Browser console shows CORS errors

**Solution:**
Add CORS configuration to S3 bucket:
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

## Support

For deployment issues:
- **CI/CD failures:** Check GitHub Actions logs
- **AWS infrastructure:** Contact DevOps team
- **CDN issues:** Check CloudFront status
- **General questions:** support@nevent.es

# Testing Procedures for CDN Deployment

This guide covers all testing procedures to validate CDN deployments for the Nevent SDKs.

## Table of Contents

- [Pre-Deployment Testing](#pre-deployment-testing)
- [Post-Deployment Testing](#post-deployment-testing)
- [Automated Testing](#automated-testing)
- [Manual Testing](#manual-testing)
- [Performance Testing](#performance-testing)
- [Security Testing](#security-testing)

## Pre-Deployment Testing

Run these tests **BEFORE** committing and pushing code to trigger deployment.

### 1. Build Verification

**Ensure packages build successfully:**

```bash
cd /path/to/nev-sdks

# Clean previous builds
npm run clean

# Install dependencies
npm ci

# Build all packages
npm run build

# Verify outputs exist
ls -lh packages/subscriptions/dist/

# Expected files:
# - nevent-subscriptions.umd.cjs
# - nevent-subscriptions.js
# - index.d.ts
```

**Success criteria:**
- ✅ No build errors
- ✅ All output files present
- ✅ File sizes reasonable (~15KB minified)

### 2. Version Extraction Test

**Verify version can be extracted from package.json:**

```bash
VERSION=$(node -p "require('./packages/subscriptions/package.json').version")
echo "Extracted version: $VERSION"

# Should output: "Extracted version: 2.0.0" (or current version)
```

**Success criteria:**
- ✅ Version extracted successfully
- ✅ Version format is valid semver (e.g., 2.0.0)

### 3. Linting and Type Checking

```bash
# Run ESLint
npm run lint

# Run type checking
npm run typecheck
```

**Success criteria:**
- ✅ No linting errors
- ✅ No TypeScript errors

### 4. Unit Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

**Success criteria:**
- ✅ All tests pass
- ✅ Coverage thresholds met (80%+ lines, functions, statements)

### 5. Local Integration Test

**Test the built files locally:**

```bash
# Serve the examples directory
cd examples/
npx serve .

# Open in browser:
# http://localhost:3000/basic-integration.html
```

**Note:** This will fail to load the SDK from CDN (since it's not deployed yet). Instead:

1. Temporarily modify `examples/basic-integration.html`
2. Replace CDN URL with local file:
   ```html
   <!-- Temporarily use local build -->
   <script src="../packages/subscriptions/dist/nevent-subscriptions.umd.cjs"></script>
   ```
3. Reload page and verify widget loads
4. Revert changes before committing

**Success criteria:**
- ✅ Widget initializes without errors
- ✅ Form renders correctly
- ✅ No console errors

## Post-Deployment Testing

Run these tests **AFTER** GitHub Actions deployment completes.

### 1. Development Environment Tests

**Test after pushing to `development` branch:**

#### 1.1 Verify S3 Upload

```bash
# Check versioned path exists
VERSION=$(node -p "require('./packages/subscriptions/package.json').version")

aws s3 ls s3://dev-nevent-sdks/subs/v${VERSION}/ --region eu-west-1

# Expected output:
# 2024-02-01 10:30:00      12345 nevent-subscriptions.umd.cjs
# 2024-02-01 10:30:00       8901 nevent-subscriptions.js
# 2024-02-01 10:30:00       2345 index.d.ts
```

**Success criteria:**
- ✅ All files present in versioned path
- ✅ File sizes match local build

#### 1.2 Verify Latest Alias

```bash
# Check latest alias exists
aws s3 ls s3://dev-nevent-sdks/subs/latest/ --region eu-west-1

# Should show same files
```

**Success criteria:**
- ✅ Latest alias updated
- ✅ Files match versioned path

#### 1.3 Test Versioned CDN URL

```bash
# Test versioned URL (immutable)
curl -I https://dev.neventapps.com/subs/v${VERSION}/nevent-subscriptions.umd.cjs

# Expected headers:
# HTTP/2 200
# cache-control: public, max-age=31536000, immutable
# server: CloudFront
# x-cache: Hit from cloudfront (after first request)
```

**Success criteria:**
- ✅ HTTP 200 response
- ✅ Cache-Control header: `max-age=31536000, immutable`
- ✅ CloudFront headers present
- ✅ Content-Type: `application/javascript` or similar

#### 1.4 Test Latest Alias URL

```bash
# Test latest alias (mutable)
curl -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs

# Expected headers:
# HTTP/2 200
# cache-control: public, max-age=300
# server: CloudFront
```

**Success criteria:**
- ✅ HTTP 200 response
- ✅ Cache-Control header: `max-age=300`
- ✅ Content matches versioned URL

#### 1.5 Download and Verify Content

```bash
# Download file
curl https://dev.neventapps.com/subs/v${VERSION}/nevent-subscriptions.umd.cjs -o downloaded.js

# Check file size
ls -lh downloaded.js

# Verify content (should start with UMD wrapper)
head -n 10 downloaded.js

# Clean up
rm downloaded.js
```

**Success criteria:**
- ✅ File downloads successfully
- ✅ File size matches expected (~15KB)
- ✅ Content is valid JavaScript (UMD wrapper)

### 2. Production Environment Tests

**Test after merging to `main` branch:**

Repeat all development tests (1.1 - 1.5) but with production URLs:
- Replace `dev-nevent-sdks` with `prd-nevent-sdks`
- Replace `dev.neventapps.com` with `neventapps.com`

#### 2.1 Verify GitHub Release

```bash
# List recent releases
gh release list

# Should show new release: v2.0.0
```

**Via GitHub UI:**
1. Navigate to repository → Releases
2. Verify release `v2.0.0` exists
3. Check release notes include:
   - ✅ CDN URLs (versioned + latest)
   - ✅ Integration example
   - ✅ Module formats listed

**Success criteria:**
- ✅ Release created with correct tag
- ✅ Release notes complete
- ✅ URLs in release notes are correct

## Automated Testing

### GitHub Actions Workflow Verification

**Check workflow execution:**

1. Navigate to GitHub Actions tab
2. Find the deployment workflow run
3. Verify all steps passed:
   - ✅ Configure AWS Credentials
   - ✅ Checkout code
   - ✅ Setup Node.js
   - ✅ Install dependencies
   - ✅ Build packages
   - ✅ Extract version
   - ✅ Upload to S3 (versioned path)
   - ✅ Upload to S3 (latest alias)
   - ✅ Invalidate CloudFront cache
   - ✅ Deployment summary

**View deployment summary:**
1. Click on workflow run
2. Scroll to "Deployment summary" step
3. Verify CDN URLs are correct

## Manual Testing

### Browser Integration Test

**Test real browser integration:**

#### Test 1: Load from CDN

1. Open `examples/basic-integration.html` in browser:
   ```bash
   open https://dev.neventapps.com/examples/basic-integration.html
   ```

   **Note:** This won't work initially. Instead, serve locally:
   ```bash
   cd examples/
   npx serve .
   # Open http://localhost:3000/basic-integration.html
   ```

2. Open browser DevTools (F12)
3. Check Network tab:
   - ✅ SDK loads from CDN (200 status)
   - ✅ No 404 errors
   - ✅ Cache headers present

4. Check Console tab:
   - ✅ "Widget loaded successfully!" message
   - ✅ No errors or warnings

5. Verify widget renders:
   - ✅ Form visible
   - ✅ Email input field present
   - ✅ Submit button visible
   - ✅ Styling applied

#### Test 2: Multiple Browsers

Test on different browsers to ensure compatibility:

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | ☐ Pass |
| Firefox | Latest | ☐ Pass |
| Safari | Latest | ☐ Pass |
| Edge | Latest | ☐ Pass |

**For each browser:**
1. Open example page
2. Verify widget loads
3. Verify no console errors
4. Test form submission (if API available)

#### Test 3: Mobile Responsiveness

Test on mobile devices or emulation:

1. Open DevTools → Device Toolbar (Ctrl+Shift+M)
2. Select device:
   - iPhone 12/13/14
   - iPad
   - Samsung Galaxy S21
3. Verify:
   - ✅ Widget responsive
   - ✅ Input fields accessible
   - ✅ Button tappable
   - ✅ No layout overflow

### Cross-Origin Test

**Verify CORS works:**

Create a test HTML file on a different domain:

```html
<!-- test-cors.html -->
<!DOCTYPE html>
<html>
<body>
  <div id="widget"></div>
  <script src="https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs"></script>
  <script>
    const widget = new NeventSubscriptions.NewsletterWidget({
      newsletterId: 'test',
      tenantId: 'test',
      containerId: 'widget'
    });
    widget.init().then(() => console.log('CORS OK'));
  </script>
</body>
</html>
```

Serve on different port and verify no CORS errors.

**Success criteria:**
- ✅ Script loads from different origin
- ✅ No CORS errors in console
- ✅ Widget initializes successfully

## Performance Testing

### 1. Load Time Test

**Measure time to load SDK:**

```bash
# Use curl to measure download time
time curl https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs -o /dev/null

# Expected: < 1 second (with good connection)
```

**Browser Network timing:**
1. Open DevTools → Network
2. Reload page
3. Find SDK request
4. Check timing:
   - ✅ DNS lookup: < 50ms
   - ✅ Initial connection: < 100ms
   - ✅ SSL handshake: < 100ms
   - ✅ Time to first byte (TTFB): < 200ms
   - ✅ Content download: < 500ms

### 2. Cache Performance Test

**Test cache hit ratio:**

```bash
# First request (cache miss)
curl -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | grep x-cache
# Expected: x-cache: Miss from cloudfront

# Second request (cache hit)
curl -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | grep x-cache
# Expected: x-cache: Hit from cloudfront
```

**Success criteria:**
- ✅ First request: Cache miss (as expected)
- ✅ Second request: Cache hit (cached at edge)
- ✅ Cache hit latency < 50ms

### 3. Compression Test

**Verify Gzip/Brotli compression:**

```bash
# Test Gzip
curl -H "Accept-Encoding: gzip" -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | grep content-encoding
# Expected: content-encoding: gzip

# Test Brotli (if supported)
curl -H "Accept-Encoding: br" -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | grep content-encoding
# Expected: content-encoding: br
```

**Compare sizes:**
```bash
# Uncompressed
curl https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | wc -c

# Gzipped
curl -H "Accept-Encoding: gzip" https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | wc -c

# Should see ~60-70% reduction
```

**Success criteria:**
- ✅ Compression enabled (Gzip or Brotli)
- ✅ Compressed size ~5KB (target)
- ✅ Compression ratio >60%

## Security Testing

### 1. HTTPS Enforcement Test

```bash
# Test HTTP redirect
curl -I http://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://dev.neventapps.com/...
```

**Success criteria:**
- ✅ HTTP requests redirect to HTTPS
- ✅ HTTPS connection works
- ✅ Valid SSL certificate

### 2. SSL Certificate Test

```bash
# Check certificate details
echo | openssl s_client -connect dev.neventapps.com:443 -servername dev.neventapps.com 2>/dev/null | openssl x509 -noout -dates -subject -issuer

# Expected output:
# notBefore=...
# notAfter=... (should be in future)
# subject=CN = neventapps.com
# issuer=... Amazon ...
```

**Via browser:**
1. Navigate to `https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs`
2. Click padlock icon in address bar
3. View certificate
4. Verify:
   - ✅ Issued to: `neventapps.com` or `*.neventapps.com`
   - ✅ Issuer: Amazon (ACM)
   - ✅ Valid from/to dates
   - ✅ No warnings

### 3. S3 Public Access Test

```bash
# Try direct S3 access (should fail)
curl -I https://dev-nevent-sdks.s3.eu-west-1.amazonaws.com/subs/latest/nevent-subscriptions.umd.cjs

# Expected: HTTP 403 Forbidden (public access blocked)
```

**Success criteria:**
- ✅ Direct S3 access blocked
- ✅ Only CloudFront can access S3 (OAC)

### 4. Content Security Test

**Check for XSS vulnerabilities:**

1. Load SDK in browser
2. Inspect global scope:
   ```javascript
   console.log(typeof NeventSubscriptions);
   // Should be: "object"

   console.log(NeventSubscriptions.NewsletterWidget);
   // Should be: function
   ```

3. Try injecting malicious code (should fail):
   ```javascript
   const widget = new NeventSubscriptions.NewsletterWidget({
     newsletterId: '<script>alert("XSS")</script>',
     tenantId: 'test',
     containerId: 'widget'
   });
   // Should not execute script
   ```

**Success criteria:**
- ✅ No XSS vulnerabilities
- ✅ Input sanitized/escaped
- ✅ No `eval()` usage

## Rollback Testing

### Test Rollback Procedure

**Simulate a bad deployment:**

1. Manually upload broken file to `/latest/`:
   ```bash
   echo "broken" > broken.js
   aws s3 cp broken.js s3://dev-nevent-sdks/subs/latest/nevent-subscriptions.umd.cjs
   ```

2. Verify it's broken:
   ```bash
   curl https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs
   # Should return: "broken"
   ```

3. Rollback to previous version:
   ```bash
   PREVIOUS_VERSION="2.0.0"
   aws s3 sync s3://dev-nevent-sdks/subs/v${PREVIOUS_VERSION}/ \
     s3://dev-nevent-sdks/subs/latest/ \
     --delete
   ```

4. Invalidate CloudFront:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id E1234567890ABC \
     --paths "/subs/latest/*"
   ```

5. Wait 5 minutes, then verify:
   ```bash
   curl https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | head -n 5
   # Should return valid UMD code
   ```

**Success criteria:**
- ✅ Rollback completes in < 5 minutes
- ✅ /latest/ points to previous version
- ✅ Versioned URLs unaffected

## Monitoring & Alerts

### CloudWatch Metrics

**Check these metrics after deployment:**

1. Navigate to CloudWatch → Metrics → CloudFront
2. Select distribution
3. Monitor:
   - **Requests:** Should increase after deployment
   - **BytesDownloaded:** Track bandwidth usage
   - **4xxErrorRate:** Should be 0%
   - **5xxErrorRate:** Should be 0%
   - **CacheHitRate:** Should be >80% after warm-up

**Success criteria:**
- ✅ No error spikes after deployment
- ✅ Cache hit rate >80%
- ✅ Latency within acceptable range

### CloudFront Access Logs

**Analyze access patterns:**

1. Enable CloudFront logging (if not enabled)
2. Download recent logs from S3
3. Analyze:
   ```bash
   # Count requests
   grep "/subs/latest/" access.log | wc -l

   # Check cache hits
   grep "Hit from cloudfront" access.log | wc -l

   # Find errors
   grep "40[0-9]" access.log
   grep "50[0-9]" access.log
   ```

## Test Checklist Summary

### Pre-Deployment
- [ ] Build succeeds
- [ ] Version extracts correctly
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Unit tests pass
- [ ] Local integration test passes

### Post-Deployment (Dev)
- [ ] S3 versioned path has files
- [ ] S3 latest alias updated
- [ ] Versioned CDN URL works (HTTP 200)
- [ ] Latest CDN URL works (HTTP 200)
- [ ] Cache headers correct
- [ ] File content valid

### Post-Deployment (Prod)
- [ ] All dev tests pass for prod
- [ ] GitHub Release created
- [ ] Release notes complete

### Manual Testing
- [ ] Browser loads SDK
- [ ] Widget renders correctly
- [ ] No console errors
- [ ] Cross-browser compatible
- [ ] Mobile responsive
- [ ] CORS works

### Performance
- [ ] Load time < 1 second
- [ ] Cache hits after second request
- [ ] Compression enabled
- [ ] Compressed size ~5KB

### Security
- [ ] HTTPS enforced
- [ ] SSL certificate valid
- [ ] Direct S3 access blocked
- [ ] No XSS vulnerabilities

### Monitoring
- [ ] CloudWatch metrics normal
- [ ] No error rate spikes
- [ ] Cache hit rate >80%

## Troubleshooting Failed Tests

### Issue: 404 Not Found on CDN

**Likely causes:**
1. Files not uploaded to S3
2. Wrong path in S3
3. CloudFront not invalidated

**Debug:**
```bash
# Check S3
aws s3 ls s3://dev-nevent-sdks/subs/ --recursive

# Check CloudFront invalidations
aws cloudfront list-invalidations --distribution-id E1234567890ABC
```

### Issue: CORS errors

**Likely causes:**
1. S3 CORS not configured
2. CloudFront not passing CORS headers

**Debug:**
```bash
# Check CORS config
aws s3api get-bucket-cors --bucket dev-nevent-sdks
```

### Issue: Cache not working

**Likely causes:**
1. Cache-Control headers incorrect
2. CloudFront cache policy wrong

**Debug:**
```bash
# Check headers
curl -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs | grep -i cache
```

## Support

For testing issues:
- **GitHub Actions:** Check workflow logs
- **AWS Infrastructure:** See AWS_INFRASTRUCTURE_SETUP.md
- **Deployment:** See DEPLOYMENT.md
- **General:** support@nevent.es

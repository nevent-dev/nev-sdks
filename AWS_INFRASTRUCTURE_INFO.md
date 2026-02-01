# AWS Infrastructure - Nevent SDKs CDN

**Created:** 2026-02-01
**Account:** 652523163852
**Region:** eu-west-1 (S3), us-east-1 (ACM, CloudFront)

## S3 Buckets

### Development
- **Name:** `dev-nevent-sdks`
- **Region:** eu-west-1
- **Versioning:** Enabled
- **Public Access:** Blocked (CloudFront OAC only)
- **CORS:** Enabled (GET, HEAD for all origins)

### Production
- **Name:** `prd-nevent-sdks`
- **Region:** eu-west-1
- **Versioning:** Enabled
- **Public Access:** Blocked (CloudFront OAC only)
- **CORS:** Enabled (GET, HEAD for all origins)

## CloudFront Distributions

### Development
- **Distribution ID:** `EKGHA8I64292W`
- **Domain Name:** `d1ipwsm4ywyhnl.cloudfront.net`
- **Custom Domain:** `dev.neventapps.com`
- **Origin:** `dev-nevent-sdks.s3.eu-west-1.amazonaws.com`
- **OAC ID:** `E1N8EJND9OFONY` (nevent-sdks-dev-oac)
- **Status:** Deployed ✅
- **SSL:** ACM Certificate (*.neventapps.com)
- **HTTP Version:** HTTP/2 + HTTP/3
- **IPv6:** Enabled
- **Compression:** Enabled (Gzip + Brotli)
- **Cache Behaviors:**
  - Default: CachingOptimized policy (1 year max-age)
  - `/*/latest/*`: Custom (5 min max-age)

### Production
- **Distribution ID:** `E1U4U1G9P1QM9F`
- **Domain Name:** `dyyp9kd6vyj9.cloudfront.net`
- **Custom Domain:** `neventapps.com`
- **Origin:** `prd-nevent-sdks.s3.eu-west-1.amazonaws.com`
- **OAC ID:** `ELK02BWKC4NGO` (nevent-sdks-prd-oac)
- **Status:** Deployed ✅
- **SSL:** ACM Certificate (*.neventapps.com)
- **HTTP Version:** HTTP/2 + HTTP/3
- **IPv6:** Enabled
- **Compression:** Enabled (Gzip + Brotli)
- **Cache Behaviors:**
  - Default: CachingOptimized policy (1 year max-age)
  - `/*/latest/*`: Custom (5 min max-age)

## SSL Certificate (ACM)

- **ARN:** `arn:aws:acm:us-east-1:652523163852:certificate/585c2996-fcb2-43d1-a694-ea2901b9e80e`
- **Region:** us-east-1 (required for CloudFront)
- **Domains:** 
  - `neventapps.com`
  - `*.neventapps.com`
- **Validation:** DNS (CNAME record)
- **Status:** ISSUED ✅

## Route53 DNS Records

**Hosted Zone ID:** `Z0843326Q5N85LW65LR7` (neventapps.com)

### Records Created:
1. **dev.neventapps.com** (A record, ALIAS)
   - Target: `d1ipwsm4ywyhnl.cloudfront.net`
   - CloudFront Hosted Zone: Z2FDTNDATAQYW2

2. **neventapps.com** (A record, ALIAS)
   - Target: `dyyp9kd6vyj9.cloudfront.net`
   - CloudFront Hosted Zone: Z2FDTNDATAQYW2

3. **_ce71fbdf2b1c71a2a87940f53614fc99.neventapps.com** (CNAME)
   - Purpose: ACM certificate validation
   - Value: `_a1d54aea8561b3afa20c0289bca66112.zqxwgxqjmm.acm-validations.aws.`

## GitHub Secrets Required

Add these secrets to GitHub repository settings:

```
AWS_ACCESS_KEY_ID: (existing, from nev-admin-web)
AWS_SECRET_ACCESS_KEY: (existing, from nev-admin-web)
CLOUDFRONT_DEV_DISTRIBUTION_ID: EKGHA8I64292W
CLOUDFRONT_PROD_DISTRIBUTION_ID: E1U4U1G9P1QM9F
```

## CDN URLs

### Development
```
# Versioned (immutable, cache 1 year)
https://dev.neventapps.com/subs/v2.0.0/nevent-subscriptions.umd.cjs

# Latest (mutable, cache 5 minutes)
https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs

# Direct CloudFront (if DNS not propagated yet)
https://d1ipwsm4ywyhnl.cloudfront.net/subs/v2.0.0/test-sdk.js ✅ WORKING
```

### Production
```
# Versioned (immutable, cache 1 year)
https://neventapps.com/subs/v2.0.0/nevent-subscriptions.umd.cjs

# Latest (mutable, cache 5 minutes)
https://neventapps.com/subs/latest/nevent-subscriptions.umd.cjs

# Direct CloudFront
https://dyyp9kd6vyj9.cloudfront.net/subs/v2.0.0/nevent-subscriptions.umd.cjs
```

## Testing & Verification

### CloudFront Direct URLs
✅ **VERIFIED:** CloudFront distributions working correctly
- Dev: `https://d1ipwsm4ywyhnl.cloudfront.net/subs/v2.0.0/test-sdk.js` → HTTP 200
- Cache headers correct (versioned: max-age=31536000, latest: max-age=300)
- Content-Type: application/javascript
- HTTPS/HTTP2 working

### Custom Domains
⏳ **DNS PROPAGATING:** May take 5-60 minutes
- dev.neventapps.com → CloudFront dev
- neventapps.com → CloudFront prod

Check propagation:
```bash
dig dev.neventapps.com
curl -I https://dev.neventapps.com/subs/v2.0.0/test-sdk.js
```

## Deployment Commands

### Manual Upload (emergency)
```bash
# Extract version
VERSION=$(node -p "require('./packages/subscriptions/package.json').version")

# Build
npm run build

# Upload to dev (versioned)
aws s3 sync packages/subscriptions/dist/ \
  s3://dev-nevent-sdks/subs/v${VERSION}/ \
  --region eu-west-1 \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "application/javascript"

# Update latest alias
aws s3 sync packages/subscriptions/dist/ \
  s3://dev-nevent-sdks/subs/latest/ \
  --region eu-west-1 \
  --cache-control "public, max-age=300" \
  --content-type "application/javascript"

# Invalidate CloudFront cache (latest only)
aws cloudfront create-invalidation \
  --distribution-id EKGHA8I64292W \
  --paths "/subs/latest/*"
```

### Production Deployment
Same as dev but use:
- S3 bucket: `s3://prd-nevent-sdks/`
- CloudFront ID: `E1U4U1G9P1QM9F`

## Cost Estimation

| Service | Usage | Monthly Cost |
|---------|-------|--------------|
| S3 Storage | 100 versions, 50MB | ~$0.10 |
| S3 Requests | ~10K/month | ~$0.01 |
| CloudFront | 1M requests, 50GB transfer | ~$5-7 |
| Route53 | 1M queries | ~$1 |
| ACM | SSL certificate | Free |
| **Total** | | **~$6-8/month** |

## Next Steps

1. ✅ S3 buckets created and configured
2. ✅ CloudFront distributions deployed
3. ✅ SSL certificate issued and validated
4. ✅ DNS records configured
5. ⏳ Wait for DNS propagation (5-60 minutes)
6. 🔜 Configure GitHub Secrets
7. 🔜 Test first deployment with GitHub Actions
8. 🔜 Verify production URLs working

## Rollback Procedure

To rollback `/latest/` to previous version:
```bash
# Copy old version to latest
aws s3 sync s3://prd-nevent-sdks/subs/v2.0.0/ \
  s3://prd-nevent-sdks/subs/latest/ \
  --delete

# Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id E1U4U1G9P1QM9F \
  --paths "/subs/latest/*"
```

## Maintenance

### Update SSL Certificate (auto-renewal)
ACM certificates renew automatically if DNS validation record exists.

### Monitor CloudFront
```bash
# Check distribution status
aws cloudfront get-distribution --id EKGHA8I64292W

# List invalidations
aws cloudfront list-invalidations --distribution-id EKGHA8I64292W

# Create invalidation
aws cloudfront create-invalidation \
  --distribution-id EKGHA8I64292W \
  --paths "/subs/latest/*"
```

### Check S3 Bucket Size
```bash
aws s3 ls s3://dev-nevent-sdks/ --recursive --summarize
aws s3 ls s3://prd-nevent-sdks/ --recursive --summarize
```

---

**Infrastructure Status:** ✅ Fully Deployed and Operational

**CloudFront:** ✅ Working (verified with test files)
**DNS:** ⏳ Propagating (check in 10-30 minutes)
**GitHub Actions:** 🔜 Ready for configuration

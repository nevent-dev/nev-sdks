# AWS Infrastructure Setup Guide

This guide documents the exact AWS infrastructure required for the Nevent SDKs CDN deployment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Create S3 Buckets](#step-1-create-s3-buckets)
- [Step 2: Configure S3 Bucket Policies](#step-2-configure-s3-bucket-policies)
- [Step 3: Request ACM SSL Certificate](#step-3-request-acm-ssl-certificate)
- [Step 4: Create CloudFront Distributions](#step-4-create-cloudfront-distributions)
- [Step 5: Configure Route53 DNS](#step-5-configure-route53-dns)
- [Step 6: Configure GitHub Secrets](#step-6-configure-github-secrets)
- [Step 7: Verify Setup](#step-7-verify-setup)

## Prerequisites

Before starting, ensure you have:

- [ ] AWS account with administrative access
- [ ] AWS CLI installed and configured
- [ ] Route53 hosted zone for `neventapps.com`
- [ ] IAM user credentials (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)
- [ ] GitHub repository admin access

## Step 1: Create S3 Buckets

### 1.1 Create Development Bucket

**Via AWS CLI:**

```bash
# Create bucket
aws s3 mb s3://dev-nevent-sdks --region eu-west-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket dev-nevent-sdks \
  --region eu-west-1 \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket dev-nevent-sdks \
  --region eu-west-1 \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket dev-nevent-sdks \
  --region eu-west-1 \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

**Via AWS Console:**

1. Navigate to S3 console
2. Click "Create bucket"
3. Settings:
   - **Bucket name:** `dev-nevent-sdks`
   - **Region:** `eu-west-1` (Europe - Ireland)
   - **Block all public access:** ✅ Enabled
   - **Bucket Versioning:** ✅ Enable
   - **Default encryption:** ✅ Server-side encryption with Amazon S3 managed keys (SSE-S3)
4. Click "Create bucket"

### 1.2 Create Production Bucket

**Via AWS CLI:**

```bash
# Create bucket
aws s3 mb s3://prd-nevent-sdks --region eu-west-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket prd-nevent-sdks \
  --region eu-west-1 \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket prd-nevent-sdks \
  --region eu-west-1 \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket prd-nevent-sdks \
  --region eu-west-1 \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

**Via AWS Console:** Same as dev, but use bucket name `prd-nevent-sdks`

### 1.3 Enable CORS (Required for CDN)

**Via AWS CLI:**

```bash
# Development bucket CORS
aws s3api put-bucket-cors \
  --bucket dev-nevent-sdks \
  --region eu-west-1 \
  --cors-configuration file://cors-config.json
```

**cors-config.json:**

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600,
      "ExposeHeaders": ["ETag"]
    }
  ]
}
```

**Repeat for production bucket:**

```bash
aws s3api put-bucket-cors \
  --bucket prd-nevent-sdks \
  --region eu-west-1 \
  --cors-configuration file://cors-config.json
```

**Via AWS Console:**

1. Navigate to bucket → Permissions → CORS
2. Paste CORS configuration JSON
3. Save changes

## Step 2: Configure S3 Bucket Policies

**IMPORTANT:** You must create CloudFront distributions FIRST (Step 4), then come back to update bucket policies with the CloudFront ARNs.

### 2.1 Placeholder Policy (Temporary)

**Via AWS CLI:**

```bash
aws s3api put-bucket-policy \
  --bucket dev-nevent-sdks \
  --region eu-west-1 \
  --policy file://bucket-policy-placeholder.json
```

**bucket-policy-placeholder.json:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dev-nevent-sdks/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/REPLACE_WITH_DEV_DIST_ID"
        }
      }
    }
  ]
}
```

### 2.2 Final Policy (After CloudFront Creation)

**Update after Step 4** with actual distribution IDs:

**Development bucket policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dev-nevent-sdks/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/E1234567890ABC"
        }
      }
    }
  ]
}
```

**Production bucket policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::prd-nevent-sdks/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/E0987654321XYZ"
        }
      }
    }
  ]
}
```

**Via AWS Console:**

1. Navigate to bucket → Permissions → Bucket Policy
2. Paste policy JSON (replace ACCOUNT_ID and distribution IDs)
3. Save changes

## Step 3: Request ACM SSL Certificate

**IMPORTANT:** ACM certificates for CloudFront **MUST** be created in `us-east-1` region (Virginia).

### 3.1 Request Certificate

**Via AWS CLI:**

```bash
# Switch to us-east-1 (CloudFront requirement)
aws acm request-certificate \
  --domain-name neventapps.com \
  --subject-alternative-names "*.neventapps.com" \
  --validation-method DNS \
  --region us-east-1
```

**Output:**

```json
{
  "CertificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-..."
}
```

**Via AWS Console:**

1. Navigate to ACM (us-east-1 region)
2. Click "Request certificate"
3. Settings:
   - **Domain names:**
     - `neventapps.com`
     - `*.neventapps.com`
   - **Validation method:** DNS validation
4. Click "Request"

### 3.2 Validate Certificate (DNS)

**Via AWS Console:**

1. Open certificate details
2. Click "Create records in Route 53" (if hosted zone exists)
3. Or manually create CNAME records:
   - **Name:** `_acm-validation.neventapps.com`
   - **Value:** (provided by ACM)

**Wait for validation:** ~5-30 minutes

**Verify:**

```bash
aws acm describe-certificate \
  --certificate-arn "arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-..." \
  --region us-east-1 \
  --query 'Certificate.Status'
```

Should return: `"ISSUED"`

## Step 4: Create CloudFront Distributions

### 4.1 Create Origin Access Control (OAC)

**Via AWS CLI:**

```bash
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "nevent-sdks-oac",
    "Description": "OAC for Nevent SDKs S3 buckets",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
  }'
```

**Output:**

```json
{
  "OriginAccessControl": {
    "Id": "E1234567890OAC"
  }
}
```

**Via AWS Console:**

1. CloudFront → Security → Origin access
2. Click "Create control setting"
3. Settings:
   - **Name:** `nevent-sdks-oac`
   - **Signing behavior:** Sign requests (recommended)
   - **Origin type:** S3
4. Create

### 4.2 Create Development Distribution

**Via AWS Console:**

1. Navigate to CloudFront → Distributions
2. Click "Create distribution"
3. **Origin settings:**
   - **Origin domain:** `dev-nevent-sdks.s3.eu-west-1.amazonaws.com`
   - **Name:** `dev-nevent-sdks`
   - **Origin access:** Origin access control settings (recommended)
   - **Origin access control:** Select `nevent-sdks-oac`
4. **Default cache behavior:**
   - **Viewer protocol policy:** Redirect HTTP to HTTPS
   - **Allowed HTTP methods:** GET, HEAD
   - **Cache policy:** CachingOptimized
   - **Compress objects automatically:** Yes
5. **Settings:**
   - **Price class:** Use all edge locations (best performance)
   - **Alternate domain names (CNAMEs):** `dev.neventapps.com`
   - **Custom SSL certificate:** Select ACM certificate from Step 3
   - **Supported HTTP versions:** HTTP/2 and HTTP/3
   - **Default root object:** (leave empty)
6. Click "Create distribution"

**Save the distribution ID** (e.g., `E1234567890ABC`)

### 4.3 Create Production Distribution

Repeat Step 4.2 with these changes:

- **Origin domain:** `prd-nevent-sdks.s3.eu-west-1.amazonaws.com`
- **Alternate domain names (CNAMEs):** `neventapps.com`

**Save the distribution ID** (e.g., `E0987654321XYZ`)

### 4.4 Update S3 Bucket Policies

Now go back to **Step 2.2** and update bucket policies with the actual CloudFront distribution ARNs.

### 4.5 Wait for Distribution Deployment

**Check status:**

```bash
aws cloudfront get-distribution \
  --id E1234567890ABC \
  --query 'Distribution.Status'
```

Should return: `"Deployed"` (wait ~10-15 minutes)

## Step 5: Configure Route53 DNS

### 5.1 Create ALIAS Records

**Via AWS CLI:**

```bash
# Get your Route53 hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
  --query "HostedZones[?Name=='neventapps.com.'].Id" \
  --output text | cut -d'/' -f3)

# Development subdomain
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://dev-dns-record.json

# Production domain
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://prod-dns-record.json
```

**dev-dns-record.json:**

```json
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "dev.neventapps.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d1234567890abc.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
```

**prod-dns-record.json:**

```json
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "neventapps.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d0987654321xyz.cloudfront.net",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
```

**Note:** `Z2FDTNDATAQYW2` is the standard CloudFront hosted zone ID (global, never changes)

**Via AWS Console:**

1. Navigate to Route53 → Hosted zones → neventapps.com
2. Click "Create record"
3. Settings:
   - **Record name:** `dev` (for dev.neventapps.com)
   - **Record type:** A - IPv4 address
   - **Alias:** ✅ Enabled
   - **Route traffic to:** Alias to CloudFront distribution
   - **Choose distribution:** Select dev distribution
4. Create record
5. Repeat for production (leave record name empty for apex domain)

### 5.2 Verify DNS Propagation

```bash
# Check dev subdomain
dig dev.neventapps.com

# Check production domain
dig neventapps.com

# Should resolve to CloudFront distribution
```

Wait ~5 minutes for DNS propagation.

## Step 6: Configure GitHub Secrets

### 6.1 Required Secrets

Navigate to GitHub repository → Settings → Secrets and variables → Actions

**Create these secrets:**

| Secret Name                       | Value                       | How to Get           |
| --------------------------------- | --------------------------- | -------------------- |
| `AWS_ACCESS_KEY_ID`               | `AKIAIOSFODNN7EXAMPLE`      | IAM user credentials |
| `AWS_SECRET_ACCESS_KEY`           | `wJalrXUtnFEMI/K7MDENG/...` | IAM user credentials |
| `CLOUDFRONT_DEV_DISTRIBUTION_ID`  | `E1234567890ABC`            | From Step 4.2        |
| `CLOUDFRONT_PROD_DISTRIBUTION_ID` | `E0987654321XYZ`            | From Step 4.3        |

### 6.2 Create IAM User (if needed)

**Via AWS CLI:**

```bash
# Create IAM user
aws iam create-user --user-name github-actions-nevent-sdks

# Create access key
aws iam create-access-key --user-name github-actions-nevent-sdks
```

**Output:**

```json
{
  "AccessKey": {
    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  }
}
```

**Save these credentials!** You cannot retrieve the secret key later.

### 6.3 Attach IAM Policy

**Via AWS CLI:**

```bash
# Create policy
aws iam create-policy \
  --policy-name NeventSDKsDeploymentPolicy \
  --policy-document file://iam-policy.json

# Attach to user
aws iam attach-user-policy \
  --user-name github-actions-nevent-sdks \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/NeventSDKsDeploymentPolicy
```

**iam-policy.json:**

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
        "arn:aws:s3:::dev-nevent-sdks",
        "arn:aws:s3:::dev-nevent-sdks/*",
        "arn:aws:s3:::prd-nevent-sdks",
        "arn:aws:s3:::prd-nevent-sdks/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations"
      ],
      "Resource": [
        "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/E1234567890ABC",
        "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/E0987654321XYZ"
      ]
    }
  ]
}
```

**Via AWS Console:**

1. IAM → Policies → Create policy
2. Paste JSON policy (replace account ID and distribution IDs)
3. Create policy
4. IAM → Users → github-actions-nevent-sdks
5. Add permissions → Attach policies directly
6. Select `NeventSDKsDeploymentPolicy`

## Step 7: Verify Setup

### 7.1 Test S3 Access

```bash
# Upload test file
echo "test" > test.txt
aws s3 cp test.txt s3://dev-nevent-sdks/test.txt --region eu-west-1

# Verify upload
aws s3 ls s3://dev-nevent-sdks/ --region eu-west-1

# Clean up
aws s3 rm s3://dev-nevent-sdks/test.txt --region eu-west-1
rm test.txt
```

### 7.2 Test CloudFront Access

```bash
# Test development CDN (will return 404 until first deployment)
curl -I https://dev.neventapps.com/test.txt

# Should return CloudFront headers:
# x-cache: Error from cloudfront
# server: CloudFront
```

### 7.3 Test SSL Certificate

```bash
# Verify SSL certificate
echo | openssl s_client -connect dev.neventapps.com:443 -servername dev.neventapps.com 2>/dev/null | openssl x509 -noout -subject -issuer

# Should show:
# subject=CN = neventapps.com
# issuer=C = US, O = Amazon, CN = Amazon RSA 2048 M02
```

### 7.4 Test GitHub Actions Deployment

1. Commit and push workflows to `development` branch
2. Push a test commit to trigger deployment
3. Check GitHub Actions logs
4. Verify files appear in S3:
   ```bash
   aws s3 ls s3://dev-nevent-sdks/subs/ --recursive
   ```
5. Test CDN URL:
   ```bash
   curl -I https://dev.neventapps.com/subs/latest/nevent-subscriptions.umd.cjs
   ```

## Troubleshooting

### Issue: S3 bucket policy denies access

**Solution:** Ensure CloudFront distribution ARN matches in bucket policy.

### Issue: CloudFront returns 403 Forbidden

**Solution:**

1. Check S3 bucket policy allows CloudFront OAC
2. Verify OAC is attached to CloudFront origin
3. Check file exists in S3

### Issue: DNS not resolving

**Solution:**

1. Verify ALIAS record points to correct CloudFront distribution
2. Wait for DNS propagation (~5-30 minutes)
3. Clear local DNS cache: `sudo dscacheutil -flushcache` (macOS)

### Issue: SSL certificate not working

**Solution:**

1. Ensure certificate is in `us-east-1` region
2. Verify certificate status is "Issued"
3. Check CNAME in CloudFront matches certificate domain

### Issue: GitHub Actions fails with "Access Denied"

**Solution:**

1. Verify IAM user has correct permissions
2. Check GitHub secrets are correctly set
3. Verify S3 bucket policy allows IAM user or CloudFront

## Cleanup (if needed)

To delete all resources:

```bash
# Delete CloudFront distributions (must disable first)
aws cloudfront delete-distribution --id E1234567890ABC --if-match ETAG

# Empty S3 buckets
aws s3 rm s3://dev-nevent-sdks --recursive
aws s3 rm s3://prd-nevent-sdks --recursive

# Delete S3 buckets
aws s3 rb s3://dev-nevent-sdks --region eu-west-1
aws s3 rb s3://prd-nevent-sdks --region eu-west-1

# Delete ACM certificate
aws acm delete-certificate \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/abcd1234-... \
  --region us-east-1

# Delete Route53 records (via console)
```

## Summary Checklist

- [ ] S3 buckets created (dev + prod)
- [ ] S3 versioning enabled
- [ ] S3 encryption enabled (SSE-S3)
- [ ] S3 CORS configured
- [ ] S3 bucket policies configured with CloudFront OAC
- [ ] ACM SSL certificate requested (us-east-1)
- [ ] ACM certificate validated (DNS)
- [ ] Origin Access Control (OAC) created
- [ ] CloudFront distributions created (dev + prod)
- [ ] CloudFront distributions deployed (wait ~10-15 min)
- [ ] Route53 ALIAS records created
- [ ] DNS propagation verified
- [ ] IAM user created
- [ ] IAM policy attached
- [ ] GitHub secrets configured
- [ ] Test deployment successful

## Next Steps

After infrastructure is set up:

1. Push code to `development` branch to trigger dev deployment
2. Verify deployment at `https://dev.neventapps.com/subs/latest/`
3. Test integration with `examples/basic-integration.html`
4. Create PR from `development` to `main` for production deployment
5. Verify production deployment at `https://neventapps.com/subs/latest/`

## Support

For infrastructure issues:

- AWS Support: https://console.aws.amazon.com/support
- CloudFront documentation: https://docs.aws.amazon.com/cloudfront
- Internal DevOps team: devops@nevent.es

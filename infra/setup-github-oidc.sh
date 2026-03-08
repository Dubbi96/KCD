#!/usr/bin/env bash
#
# Step 4: GitHub Actions OIDC 설정
#
# GitHub Actions가 AWS에 접근할 수 있도록 OIDC Identity Provider와 IAM Role을 생성합니다.
# GitHub Secrets에 이 Role ARN을 AWS_DEPLOY_ROLE_ARN으로 등록합니다.
#
# 실행 위치: 로컬 머신 (AWS CLI 설정 완료 상태)
# 실행 방법: bash KCD/infra/setup-github-oidc.sh
#
set -euo pipefail

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="ap-northeast-2"

# ─── 설정값 (본인 GitHub 레포에 맞게 수정) ────────────────────
GITHUB_ORG="Dubbi96"        # GitHub 유저명 또는 Organization
KCD_REPO="KCD"              # KCD 레포 이름
KCP_REPO="KCP"              # KCP 레포 이름
ROLE_NAME="katab-github-deploy"
# ──────────────────────────────────────────────────────────────

echo "=== GitHub Actions OIDC 설정 ==="
echo "AWS Account: $ACCOUNT_ID"
echo "GitHub Org:  $GITHUB_ORG"
echo ""

# 1. GitHub OIDC Provider 등록 (AWS에 GitHub를 신뢰하는 IdP로 등록)
echo "[1/3] GitHub OIDC Identity Provider 등록..."
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" 2>/dev/null; then
  echo "  이미 존재합니다."
else
  # GitHub의 thumbprint (고정값)
  THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "$THUMBPRINT"
  echo "  생성 완료."
fi

# 2. IAM Role 생성 (GitHub Actions가 assume 할 Role)
echo "[2/3] IAM Role 생성: $ROLE_NAME"

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:${GITHUB_ORG}/${KCD_REPO}:ref:refs/heads/main",
            "repo:${GITHUB_ORG}/${KCP_REPO}:ref:refs/heads/main"
          ]
        }
      }
    }
  ]
}
EOF
)

if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  echo "  이미 존재합니다. Trust policy 업데이트..."
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "GitHub Actions deploy role for Katab platform"
  echo "  생성 완료."
fi

# 3. 필요한 권한 부여
echo "[3/3] 권한 정책 연결..."

DEPLOY_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECR",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECS",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:UpdateService",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/katab-*"
    },
    {
      "Sid": "S3Dashboard",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::katab-dashboard-*",
        "arn:aws:s3:::katab-dashboard-*/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "*"
    }
  ]
}
EOF
)

POLICY_NAME="katab-github-deploy-policy"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

if aws iam get-policy --policy-arn "$POLICY_ARN" 2>/dev/null; then
  echo "  Policy 이미 존재합니다. 새 버전 생성..."
  # 기존 버전이 5개면 가장 오래된 것 삭제
  OLD_VERSIONS=$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
    --query "Versions[?IsDefaultVersion==\`false\`].VersionId" --output text)
  for v in $OLD_VERSIONS; do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$v" 2>/dev/null || true
  done
  aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document "$DEPLOY_POLICY" \
    --set-as-default
else
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "$DEPLOY_POLICY"
fi

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN" 2>/dev/null || true

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo ""
echo "=== 완료 ==="
echo ""
echo "Role ARN: $ROLE_ARN"
echo ""
echo "이제 GitHub에서 다음 Secrets를 설정하세요:"
echo ""
echo "  [KCD 레포 + KCP 레포 공통]"
echo "  AWS_DEPLOY_ROLE_ARN = $ROLE_ARN"
echo ""
echo "  [KCD 레포 전용 — terraform output에서 확인]"
echo "  DASHBOARD_BUCKET            = (terraform output dashboard_bucket)"
echo "  CLOUDFRONT_DISTRIBUTION_ID  = (terraform output 후 aws cloudfront로 확인)"
echo ""
echo "GitHub Secrets 설정 방법:"
echo "  1. https://github.com/${GITHUB_ORG}/${KCD_REPO}/settings/secrets/actions"
echo "  2. 'New repository secret' 클릭"
echo "  3. 위 값들을 각각 등록"
echo ""
echo "  KCP 레포도 동일하게:"
echo "  https://github.com/${GITHUB_ORG}/${KCP_REPO}/settings/secrets/actions"
echo "  AWS_DEPLOY_ROLE_ARN = $ROLE_ARN"

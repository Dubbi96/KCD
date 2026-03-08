#!/usr/bin/env bash
#
# Step 1: Terraform State Backend 부트스트랩
#
# Terraform이 상태를 저장할 S3 버킷과 동시 실행 방지용 DynamoDB 테이블을 생성합니다.
# 이 스크립트는 최초 1회만 실행하면 됩니다.
#
# 실행 위치: 로컬 머신 (AWS CLI 설정 완료 상태)
# 실행 방법: bash KCD/infra/bootstrap-state.sh
#
set -euo pipefail

REGION="ap-northeast-2"
BUCKET="katab-terraform-state"
TABLE="katab-terraform-locks"

echo "=== Terraform State Backend 생성 ==="
echo ""

# 1. S3 버킷 생성
echo "[1/3] S3 버킷 생성: $BUCKET"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "  이미 존재합니다. 건너뜁니다."
else
  aws s3api create-bucket \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
  echo "  생성 완료."
fi

# 2. S3 버킷 버전 관리 활성화 (실수로 state 삭제 방지)
echo "[2/3] S3 버전 관리 활성화"
aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
echo "  완료."

# 3. DynamoDB 테이블 생성 (Terraform state locking)
echo "[3/3] DynamoDB 테이블 생성: $TABLE"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" 2>/dev/null | grep -q "ACTIVE"; then
  echo "  이미 존재합니다. 건너뜁니다."
else
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"
  echo "  생성 완료. 활성화 대기 중..."
  aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  echo "  활성화 완료."
fi

echo ""
echo "=== 완료 ==="
echo "S3 버킷:      s3://$BUCKET"
echo "DynamoDB:      $TABLE"
echo ""
echo "다음 단계: cd KCD/infra/terraform && terraform init"

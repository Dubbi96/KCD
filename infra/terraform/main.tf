# =============================================================================
# Katab Cloud Dashboard (KCD) - Main Terraform Configuration
# =============================================================================
# This configuration manages:
#   - KCD infrastructure (NestJS backend + React/Vite frontend)
#   - Shared resources used by KCP (VPC, ECS cluster, RDS, ALB target group)
#   - KCP's ECR repository and RDS instance
# KCP's own Terraform only creates its ECR repo, ECS task definition, and service.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "s3" {
    bucket         = "katab-terraform-state"
    key            = "kcd/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "katab-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# -----------------------------------------------------------------------------
# Locals
# -----------------------------------------------------------------------------
locals {
  name_prefix = "${var.project}-${var.environment}"

  azs = ["${var.aws_region}a", "${var.aws_region}c"]

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Random suffix for globally unique S3 bucket names
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

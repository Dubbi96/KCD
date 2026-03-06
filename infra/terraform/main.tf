terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "katab-terraform-state"
    key    = "katab-platform/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "katab-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ===== Network =====
module "vpc" {
  source = "./modules/vpc"

  project_name = var.project_name
  environment  = var.environment
  vpc_cidr     = var.vpc_cidr
}

# ===== Security Groups =====
module "security_groups" {
  source = "./modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# ===== ECR =====
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
}

# ===== RDS PostgreSQL =====
module "rds" {
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.rds_sg_id
  db_username        = var.db_username
  db_password        = var.db_password
  db_name            = var.db_name
  instance_class     = var.rds_instance_class
}

# ===== ElastiCache Redis =====
module "elasticache" {
  source = "./modules/elasticache"

  project_name      = var.project_name
  environment       = var.environment
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.security_groups.redis_sg_id
  node_type         = var.redis_node_type
}

# ===== S3 (Scenario/Report Storage) =====
module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
}

# ===== ALB =====
module "alb" {
  source = "./modules/alb"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.public_subnet_ids
  security_group_id = module.security_groups.alb_sg_id
  certificate_arn   = var.certificate_arn
}

# ===== ECS Fargate =====
module "ecs" {
  source = "./modules/ecs"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.security_groups.ecs_sg_id
  target_group_arn  = module.alb.target_group_arn
  ecr_repo_url      = module.ecr.repository_url

  # App config
  container_port = 4000
  cpu            = var.ecs_cpu
  memory         = var.ecs_memory
  desired_count  = var.ecs_desired_count

  # Environment variables for the container
  db_host        = module.rds.endpoint
  db_port        = "5432"
  db_username    = var.db_username
  db_password    = var.db_password
  db_name        = var.db_name
  redis_host     = module.elasticache.endpoint
  redis_port     = "6379"
  jwt_secret     = var.jwt_secret
  s3_bucket      = module.s3.bucket_name
}

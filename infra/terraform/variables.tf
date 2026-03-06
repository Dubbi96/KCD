variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "katab"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

# RDS
variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "katab"
  sensitive   = true
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "katab_orchestrator"
}

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

# ElastiCache
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

# ECS
variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "ECS task memory (MiB)"
  type        = number
  default     = 1024
}

variable "ecs_desired_count" {
  description = "Number of ECS tasks"
  type        = number
  default     = 1
}

# Security
variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
  default     = ""
}

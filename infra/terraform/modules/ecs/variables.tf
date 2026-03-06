variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "target_group_arn" { type = string }
variable "ecr_repo_url" { type = string }
variable "container_port" { type = number }
variable "cpu" { type = number }
variable "memory" { type = number }
variable "desired_count" { type = number }

# App environment
variable "db_host" { type = string }
variable "db_port" { type = string }
variable "db_username" { type = string }
variable "db_password" { type = string }
variable "db_name" { type = string }
variable "redis_host" { type = string }
variable "redis_port" { type = string }
variable "jwt_secret" { type = string }
variable "s3_bucket" { type = string }

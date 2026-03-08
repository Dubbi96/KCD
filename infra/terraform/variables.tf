# =============================================================================
# Variables
# =============================================================================

# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name used as prefix for all resource names"
  type        = string
  default     = "katab"
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
variable "db_username" {
  description = "Master username for RDS PostgreSQL instances"
  type        = string
  default     = "katab"
  sensitive   = true
}

variable "db_password" {
  description = "Master password for RDS PostgreSQL instances"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Security / Auth
# -----------------------------------------------------------------------------
variable "jwt_secret" {
  description = "JWT signing secret for KCD authentication"
  type        = string
  sensitive   = true
}

variable "kcp_service_token" {
  description = "Service token for KCD -> KCP communication (X-Service-Token header)"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Container Image Tags
# -----------------------------------------------------------------------------
variable "kcd_image_tag" {
  description = "Docker image tag for KCD container"
  type        = string
  default     = "latest"
}

variable "kcp_image_tag" {
  description = "Docker image tag for KCP container"
  type        = string
  default     = "latest"
}

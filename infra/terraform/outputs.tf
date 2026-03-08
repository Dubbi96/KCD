# =============================================================================
# Outputs
# =============================================================================
# These outputs are consumed by:
#   - KCP Terraform (via remote state data source)
#   - CI/CD pipelines
#   - Developer reference
# =============================================================================

# -----------------------------------------------------------------------------
# VPC / Network
# -----------------------------------------------------------------------------
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS, RDS)"
  value       = aws_subnet.private[*].id
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------
output "ecs_cluster_arn" {
  description = "ECS cluster ARN (shared by KCD and KCP)"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_execution_role_arn" {
  description = "ECS task execution role ARN (shared by KCD and KCP)"
  value       = aws_iam_role.ecs_task_execution.arn
}

# -----------------------------------------------------------------------------
# ALB
# -----------------------------------------------------------------------------
output "kcd_alb_dns" {
  description = "KCD ALB DNS name"
  value       = aws_lb.kcd.dns_name
}

output "kcp_alb_dns" {
  description = "KCP ALB DNS name"
  value       = aws_lb.kcp.dns_name
}

output "kcp_target_group_arn" {
  description = "KCP ALB target group ARN (KCP ECS service registers to this)"
  value       = aws_lb_target_group.kcp.arn
}

# -----------------------------------------------------------------------------
# ECR
# -----------------------------------------------------------------------------
output "kcd_ecr_url" {
  description = "KCD ECR repository URL"
  value       = aws_ecr_repository.kcd.repository_url
}

output "kcp_ecr_url" {
  description = "KCP ECR repository URL"
  value       = aws_ecr_repository.kcp.repository_url
}

# -----------------------------------------------------------------------------
# RDS
# -----------------------------------------------------------------------------
output "kcd_rds_endpoint" {
  description = "KCD RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.kcd.endpoint
  sensitive   = true
}

output "kcp_rds_endpoint" {
  description = "KCP RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.kcp.endpoint
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------
output "ecs_sg_id" {
  description = "ECS security group ID"
  value       = aws_security_group.ecs.id
}

output "rds_sg_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

# -----------------------------------------------------------------------------
# Dashboard / CloudFront
# -----------------------------------------------------------------------------
output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.dashboard.domain_name
}

output "dashboard_bucket" {
  description = "S3 bucket name for dashboard static files"
  value       = aws_s3_bucket.dashboard.id
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups
# -----------------------------------------------------------------------------
output "kcd_log_group" {
  description = "CloudWatch log group for KCD ECS tasks"
  value       = aws_cloudwatch_log_group.kcd.name
}

output "kcp_log_group" {
  description = "CloudWatch log group for KCP ECS tasks"
  value       = aws_cloudwatch_log_group.kcp.name
}

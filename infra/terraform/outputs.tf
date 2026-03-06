output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "ALB DNS name (Cloud Orchestrator endpoint)"
  value       = module.alb.dns_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.endpoint
  sensitive   = true
}

output "ecr_repository_url" {
  description = "ECR repository URL for Docker images"
  value       = module.ecr.repository_url
}

output "s3_bucket_name" {
  description = "S3 bucket for scenarios and reports"
  value       = module.s3.bucket_name
}

output "runner_redis_config" {
  description = "Redis connection config for Local Runner .env"
  value       = "REDIS_HOST=${module.elasticache.endpoint}\nREDIS_PORT=6379"
  sensitive   = true
}

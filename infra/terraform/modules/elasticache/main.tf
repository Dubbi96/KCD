resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-redis-subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Katab BullMQ Redis cluster"

  node_type            = var.node_type
  num_cache_clusters   = 1
  port                 = 6379

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.security_group_id]

  engine               = "redis"
  engine_version       = "7.1"
  parameter_group_name = "default.redis7"

  automatic_failover_enabled = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit = 1

  tags = { Name = "${var.project_name}-${var.environment}-redis" }
}

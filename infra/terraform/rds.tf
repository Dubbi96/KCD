# =============================================================================
# RDS PostgreSQL Instances
# =============================================================================
# Two RDS instances in the same DB subnet group:
#   1. katab_orchestrator  - KCD's database
#   2. katab_control_plane - KCP's database (created here to avoid cross-repo deps)
# =============================================================================

# -----------------------------------------------------------------------------
# DB Subnet Group (shared by both instances)
# -----------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-db-subnet-group"
  }
}

# -----------------------------------------------------------------------------
# KCD RDS Instance - katab_orchestrator
# -----------------------------------------------------------------------------
resource "aws_db_instance" "kcd" {
  identifier = "${local.name_prefix}-kcd-db"

  engine         = "postgres"
  engine_version = "15"
  instance_class = "db.t3.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "katab_orchestrator"
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = false
  publicly_accessible = false

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  skip_final_snapshot       = true
  final_snapshot_identifier = "${local.name_prefix}-kcd-db-final"
  deletion_protection       = false

  performance_insights_enabled = false

  tags = {
    Name    = "${local.name_prefix}-kcd-db"
    Service = "kcd"
  }
}

# -----------------------------------------------------------------------------
# KCP RDS Instance - katab_control_plane
# -----------------------------------------------------------------------------
resource "aws_db_instance" "kcp" {
  identifier = "${local.name_prefix}-kcp-db"

  engine         = "postgres"
  engine_version = "15"
  instance_class = "db.t3.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "katab_control_plane"
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = false
  publicly_accessible = false

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  skip_final_snapshot       = true
  final_snapshot_identifier = "${local.name_prefix}-kcp-db-final"
  deletion_protection       = false

  performance_insights_enabled = false

  tags = {
    Name    = "${local.name_prefix}-kcp-db"
    Service = "kcp"
  }
}

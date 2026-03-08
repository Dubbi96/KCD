# =============================================================================
# ECS Fargate - Shared Cluster + KCD Task Definition & Service
# =============================================================================
# The ECS cluster is shared between KCD and KCP.
# KCP's task definition and service live in the KCP repo's Terraform.
# =============================================================================

# -----------------------------------------------------------------------------
# ECS Cluster (shared)
# -----------------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "kcd" {
  name              = "/ecs/${local.name_prefix}-kcd"
  retention_in_days = 30

  tags = {
    Name    = "${local.name_prefix}-kcd-logs"
    Service = "kcd"
  }
}

resource "aws_cloudwatch_log_group" "kcp" {
  name              = "/ecs/${local.name_prefix}-kcp"
  retention_in_days = 30

  tags = {
    Name    = "${local.name_prefix}-kcp-logs"
    Service = "kcp"
  }
}

# -----------------------------------------------------------------------------
# IAM - Task Execution Role (pulls images, writes logs, reads secrets)
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_base" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  # NOTE: AWS managed policy ARN — the double-colon is intentional (empty region field)
}

data "aws_iam_policy_document" "ecs_task_execution_extra" {
  statement {
    sid    = "ECRPull"
    effect = "Allow"
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:CreateLogGroup",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "SecretsManagerRead"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_extra" {
  name   = "${local.name_prefix}-ecs-execution-extra"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_extra.json
}

# -----------------------------------------------------------------------------
# IAM - Task Role (the role the container app assumes at runtime)
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = {
    Name = "${local.name_prefix}-ecs-task-role"
  }
}

data "aws_iam_policy_document" "ecs_task_policy" {
  statement {
    sid    = "S3Access"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.dashboard.arn,
      "${aws_s3_bucket.dashboard.arn}/*",
    ]
  }

  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_policy" {
  name   = "${local.name_prefix}-ecs-task-policy"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_policy.json
}

# -----------------------------------------------------------------------------
# KCD Task Definition
# -----------------------------------------------------------------------------
resource "aws_ecs_task_definition" "kcd" {
  family                   = "${local.name_prefix}-kcd"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "kcd"
      image     = "${aws_ecr_repository.kcd.repository_url}:${var.kcd_image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "4000" },
        { name = "DB_HOST", value = split(":", aws_db_instance.kcd.endpoint)[0] },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_DATABASE", value = "katab_orchestrator" },
        { name = "DB_USERNAME", value = var.db_username },
        { name = "DB_PASSWORD", value = var.db_password },
        { name = "JWT_SECRET", value = var.jwt_secret },
        { name = "KCP_API_URL", value = "http://${aws_lb.kcp.dns_name}/api" },
        { name = "KCP_SERVICE_TOKEN", value = var.kcp_service_token },
        { name = "NODE_ENV", value = var.environment },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.kcd.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "kcd"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/v1 | grep -qE '^[2-4]' || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name    = "${local.name_prefix}-kcd-task"
    Service = "kcd"
  }
}

# -----------------------------------------------------------------------------
# KCD ECS Service
# -----------------------------------------------------------------------------
resource "aws_ecs_service" "kcd" {
  name            = "${local.name_prefix}-kcd"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.kcd.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.kcd.arn
    container_name   = "kcd"
    container_port   = 4000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  depends_on = [
    aws_lb_listener.kcd,
    aws_iam_role_policy.ecs_task_execution_extra,
  ]

  tags = {
    Name    = "${local.name_prefix}-kcd-service"
    Service = "kcd"
  }
}

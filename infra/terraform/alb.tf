# =============================================================================
# Application Load Balancers
# =============================================================================
# Two ALBs:
#   1. katab-kcd-alb - routes to KCD backend (port 4000)
#   2. katab-kcp-alb - routes to KCP backend (port 4100)
#        KCP target group is created here; KCP's ECS service registers to it.
# =============================================================================

# =============================================================================
# KCD ALB
# =============================================================================

resource "aws_lb" "kcd" {
  name               = "${local.name_prefix}-kcd-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name    = "${local.name_prefix}-kcd-alb"
    Service = "kcd"
  }
}

resource "aws_lb_target_group" "kcd" {
  name        = "${local.name_prefix}-kcd-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/v1"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-499"
  }

  tags = {
    Name    = "${local.name_prefix}-kcd-tg"
    Service = "kcd"
  }
}

resource "aws_lb_listener" "kcd" {
  load_balancer_arn = aws_lb.kcd.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.kcd.arn
  }

  tags = {
    Name    = "${local.name_prefix}-kcd-listener"
    Service = "kcd"
  }
}

# =============================================================================
# KCP ALB
# =============================================================================

resource "aws_lb" "kcp" {
  name               = "${local.name_prefix}-kcp-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name    = "${local.name_prefix}-kcp-alb"
    Service = "kcp"
  }
}

resource "aws_lb_target_group" "kcp" {
  name        = "${local.name_prefix}-kcp-tg"
  port        = 4100
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-499"
  }

  tags = {
    Name    = "${local.name_prefix}-kcp-tg"
    Service = "kcp"
  }
}

resource "aws_lb_listener" "kcp" {
  load_balancer_arn = aws_lb.kcp.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.kcp.arn
  }

  tags = {
    Name    = "${local.name_prefix}-kcp-listener"
    Service = "kcp"
  }
}

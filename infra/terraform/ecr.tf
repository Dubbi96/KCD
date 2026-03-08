# =============================================================================
# ECR Repositories
# =============================================================================
# Two repositories:
#   1. katab-kcd - KCD Docker images
#   2. katab-kcp - KCP Docker images (shared, created here)
# =============================================================================

# -----------------------------------------------------------------------------
# KCD ECR Repository
# -----------------------------------------------------------------------------
resource "aws_ecr_repository" "kcd" {
  name                 = "${var.project}-kcd"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name    = "${var.project}-kcd"
    Service = "kcd"
  }
}

# -----------------------------------------------------------------------------
# KCP ECR Repository
# -----------------------------------------------------------------------------
resource "aws_ecr_repository" "kcp" {
  name                 = "${var.project}-kcp"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name    = "${var.project}-kcp"
    Service = "kcp"
  }
}

# -----------------------------------------------------------------------------
# Lifecycle Policy (shared) - Keep last 10 images, expire untagged after 7 days
# -----------------------------------------------------------------------------
resource "aws_ecr_lifecycle_policy" "kcd" {
  repository = aws_ecr_repository.kcd.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep only last 10 tagged images"
        selection = {
          tagStatus   = "tagged"
          tagPrefixList = ["v", "latest"]
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "kcp" {
  repository = aws_ecr_repository.kcp.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep only last 10 tagged images"
        selection = {
          tagStatus   = "tagged"
          tagPrefixList = ["v", "latest"]
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

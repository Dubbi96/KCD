# =============================================================================
# Dashboard Static Hosting (S3 + CloudFront)
# =============================================================================
# CloudFront distribution with two origins:
#   - Default (*): S3 bucket for React/Vite static files
#   - /api/v1/*:   KCD ALB for API requests
# =============================================================================

# -----------------------------------------------------------------------------
# S3 Bucket for Dashboard Static Files
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "dashboard" {
  bucket        = "${var.project}-dashboard-${random_id.bucket_suffix.hex}"
  force_destroy = true

  tags = {
    Name    = "${local.name_prefix}-dashboard"
    Service = "kcd-dashboard"
  }
}

resource "aws_s3_bucket_versioning" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# CloudFront Origin Access Control (OAC) for S3
# -----------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "${local.name_prefix}-dashboard-oac"
  description                       = "OAC for dashboard S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# -----------------------------------------------------------------------------
# S3 Bucket Policy - Allow CloudFront OAC
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "dashboard_bucket_policy" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.dashboard.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.dashboard.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  policy = data.aws_iam_policy_document.dashboard_bucket_policy.json
}

# -----------------------------------------------------------------------------
# CloudFront Distribution
# -----------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} dashboard distribution"
  price_class         = "PriceClass_200" # Asia + US + Europe

  # ---------------------------------------------------------------------------
  # Origin 1: S3 Bucket (dashboard static files)
  # ---------------------------------------------------------------------------
  origin {
    domain_name              = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_id                = "s3-dashboard"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  # ---------------------------------------------------------------------------
  # Origin 2: KCD ALB (API backend)
  # ---------------------------------------------------------------------------
  origin {
    domain_name = aws_lb.kcd.dns_name
    origin_id   = "alb-kcd-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---------------------------------------------------------------------------
  # Default Cache Behavior: S3 static files
  # ---------------------------------------------------------------------------
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-dashboard"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # ---------------------------------------------------------------------------
  # Ordered Cache Behavior: /ws/* -> ALB (WebSocket, no caching)
  # ---------------------------------------------------------------------------
  ordered_cache_behavior {
    path_pattern           = "/ws/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-kcd-api"
    viewer_protocol_policy = "redirect-to-https"
    compress               = false

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # ---------------------------------------------------------------------------
  # Ordered Cache Behavior: /api/v1/* -> ALB (no caching)
  # ---------------------------------------------------------------------------
  ordered_cache_behavior {
    path_pattern           = "/api/v1/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-kcd-api"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Origin", "Accept", "Content-Type"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # ---------------------------------------------------------------------------
  # Custom Error Responses (SPA routing)
  # ---------------------------------------------------------------------------
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  # ---------------------------------------------------------------------------
  # Restrictions
  # ---------------------------------------------------------------------------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # ---------------------------------------------------------------------------
  # SSL/TLS - Default CloudFront certificate
  # ---------------------------------------------------------------------------
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name    = "${local.name_prefix}-dashboard-cdn"
    Service = "kcd-dashboard"
  }
}

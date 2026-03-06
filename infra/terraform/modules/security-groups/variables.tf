variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }

variable "allowed_runner_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to access Redis (local runner IPs). Must not be 0.0.0.0/0 in production."
  default     = []

  validation {
    condition     = !contains(var.allowed_runner_cidrs, "0.0.0.0/0")
    error_message = "0.0.0.0/0 is not allowed for Redis access. Use specific CIDR ranges for runner IPs."
  }
}

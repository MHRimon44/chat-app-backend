variable "application_name" {
  description = "Stable lowercase application identifier."
  type        = string
  default     = "production-chat"
}
variable "environment" {
  description = "Isolated deployment environment."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}
variable "aws_region" {
  description = "Approved AWS region for application and user data."
  type        = string
}
variable "mongodb_atlas_project_id" {
  description = "Existing Atlas project; credentials remain in Secrets Manager."
  type        = string
  sensitive   = true
}
variable "alert_email" {
  description = "Verified operational alert destination."
  type        = string
}
variable "ses_identity_arn" {
  description = "ARN of the verified SES domain identity allowed to send password recovery email."
  type        = string
  validation {
    condition     = can(regex("^arn:[^:]+:ses:[^:]+:[0-9]{12}:identity/.+$", var.ses_identity_arn))
    error_message = "ses_identity_arn must be a verified SES identity ARN."
  }
}

output "api_repository_url" { value = aws_ecr_repository.api.repository_url }
output "api_runtime_secret_arn" {
  value     = aws_secretsmanager_secret.api_runtime.arn
  sensitive = true
}
output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }
output "api_task_role_arn" { value = aws_iam_role.api_task.arn }

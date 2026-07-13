terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_secretsmanager_secret" "app" {
  name        = var.secret_name
  description = "fl-snf-backend runtime configuration and credentials"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    NODE_ENV     = var.node_env
    PORT         = var.port
    FRONTEND_URL = var.frontend_url

    DB_HOST     = var.db_host
    DB_PORT     = var.db_port
    DB_USER     = var.db_user
    DB_PASSWORD = var.db_password
    DB_NAME     = var.db_name

    MYSQL_ROOT_PASSWORD = var.mysql_root_password
    MYSQL_DATABASE      = var.db_name

    JWT_SECRET      = var.jwt_secret
    JWT_EXPIRES_IN  = var.jwt_expires_in

    BUCKET_NAME              = var.bucket_name
    BUCKET_ACCESS_KEY_ID     = var.bucket_access_key_id
    BUCKET_SECRET_ACCESS_KEY = var.bucket_secret_access_key
    BUCKET_REGION            = var.bucket_region
    BUCKET_ENDPOINT          = var.bucket_endpoint
  })
}

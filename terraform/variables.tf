variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "secret_name" {
  type    = string
  default = "fl-snf-backend/app"
}

variable "node_env" {
  type    = string
  default = "production"
}

variable "port" {
  type    = string
  default = "3001"
}

variable "frontend_url" {
  type = string
}

variable "db_host" {
  type      = string
  sensitive = true
}

variable "db_port" {
  type    = string
  default = "3306"
}

variable "db_user" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "db_name" {
  type = string
}

variable "mysql_root_password" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "jwt_expires_in" {
  type    = string
  default = "8h"
}

variable "bucket_name" {
  type = string
}

variable "bucket_access_key_id" {
  type      = string
  sensitive = true
}

variable "bucket_secret_access_key" {
  type      = string
  sensitive = true
}

variable "bucket_region" {
  type    = string
  default = "us-east-1"
}

variable "bucket_endpoint" {
  type = string
}

# ══════════════════════════════════════════════════════
#  deploy.config.sh  —  Configuración de deployment
#  Edita estos valores antes de ejecutar deploy.sh
# ══════════════════════════════════════════════════════

# ── EC2 ──────────────────────────────────────────────
EC2_USER="ec2-user"                     # ec2-user (Amazon Linux) | ubuntu (Ubuntu)
EC2_IP=""                               # IP pública del EC2, ej: 54.123.45.67
EC2_KEY="$HOME/.ssh/fl-snf.pem"        # Ruta a tu archivo .pem
EC2_BACKEND_DIR="/home/ec2-user/backend"

# ── S3 + CloudFront ───────────────────────────────────
S3_BUCKET="fl-snf-frontend"            # Nombre del bucket S3
CLOUDFRONT_DIST_ID=""                   # ID de distribución CloudFront, ej: E1ABC123DEF456

# ── Rutas locales ─────────────────────────────────────
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_LOCAL="$(cd "$DEPLOY_DIR/.." && pwd)"
FRONTEND_LOCAL="$(cd "$DEPLOY_DIR/../../SS_ACTUALIZACION_PLATAFORMA2026" && pwd)"

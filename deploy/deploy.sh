#!/usr/bin/env bash
# ══════════════════════════════════════════════════════
#  deploy.sh  —  Deploy FL-SNF a AWS
#
#  Uso:
#    ./deploy.sh            → despliega backend + frontend
#    ./deploy.sh backend    → solo backend (EC2)
#    ./deploy.sh frontend   → solo frontend (S3 + CloudFront)
#    ./deploy.sh check      → verifica configuración y servicios
# ══════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy.config.sh"

# ── Colores ───────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
banner() { echo -e "\n${CYAN}══════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}══════════════════════════════${NC}"; }

# ── Validaciones ─────────────────────────────────────
check_config() {
    [ -z "$EC2_IP" ]              && err "EC2_IP no configurado en deploy.config.sh"
    [ ! -f "$EC2_KEY" ]           && err "EC2_KEY no encontrado: $EC2_KEY"
    [ ! -d "$BACKEND_LOCAL" ]     && err "BACKEND_LOCAL no existe: $BACKEND_LOCAL"
    [ ! -d "$FRONTEND_LOCAL" ]    && err "FRONTEND_LOCAL no existe: $FRONTEND_LOCAL"
    command -v ssh  &>/dev/null   || err "ssh no está instalado"
    command -v scp  &>/dev/null   || err "scp no está instalado"
}

check_frontend_config() {
    command -v aws &>/dev/null    || err "AWS CLI no está instalado. Instálalo: https://aws.amazon.com/cli/"
    [ -z "$S3_BUCKET" ]           && err "S3_BUCKET no configurado en deploy.config.sh"
    aws sts get-caller-identity &>/dev/null || err "AWS CLI no autenticado. Ejecuta: aws configure"
}

# ── Deploy Backend → EC2 ──────────────────────────────
deploy_backend() {
    banner "Deploy Backend → EC2"

    check_config

    local TMPTAR="/tmp/fl-snf-backend-$(date +%s).tar.gz"

    info "Empaquetando backend..."
    tar -czf "$TMPTAR" \
        -C "$BACKEND_LOCAL" \
        --exclude="node_modules" \
        --exclude=".env" \
        --exclude="tests" \
        --exclude=".vs" \
        --exclude="deploy" \
        . || err "Error al crear el paquete"

    local SIZE
    SIZE=$(du -sh "$TMPTAR" | cut -f1)
    info "Paquete creado ($SIZE) → subiendo al EC2..."

    scp -i "$EC2_KEY" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout=15 \
        "$TMPTAR" "$EC2_USER@$EC2_IP:/tmp/fl-snf-backend.tar.gz" \
        || err "Error al subir al EC2. Verifica IP y permisos del .pem"

    info "Instalando en EC2..."
    ssh -i "$EC2_KEY" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout=15 \
        "$EC2_USER@$EC2_IP" \
        "
        set -e
        echo '→ Extrayendo archivos...'
        mkdir -p $EC2_BACKEND_DIR
        tar -xzf /tmp/fl-snf-backend.tar.gz -C $EC2_BACKEND_DIR
        rm /tmp/fl-snf-backend.tar.gz

        echo '→ Instalando dependencias...'
        cd $EC2_BACKEND_DIR
        npm install --production --silent

        echo '→ Ejecutando migraciones...'
        node db/migrate.js || echo 'Migración ya aplicada'

        echo '→ Reiniciando servidor...'
        if pm2 list | grep -q 'fl-snf-backend'; then
            pm2 reload fl-snf-backend --update-env
        else
            pm2 start server.js --name fl-snf-backend
        fi
        pm2 save

        echo ''
        pm2 status fl-snf-backend
        " || err "Error en la instalación remota"

    rm -f "$TMPTAR"
    log "Backend desplegado correctamente"

    info "Verificando health check..."
    sleep 3
    local HEALTH
    HEALTH=$(ssh -i "$EC2_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" \
        "curl -s http://localhost:3001/api/health | grep -o '\"status\":\"[^\"]*\"' | head -1" 2>/dev/null || echo "no response")
    log "Health check: $HEALTH"
}

# ── Deploy Frontend → S3 + CloudFront ─────────────────
deploy_frontend() {
    banner "Deploy Frontend → S3 + CloudFront"

    check_frontend_config

    info "Sincronizando con S3: s3://$S3_BUCKET ..."
    aws s3 sync "$FRONTEND_LOCAL" "s3://$S3_BUCKET" \
        --exclude "*.docx" \
        --exclude "*.pptx" \
        --exclude "*.xlsx" \
        --exclude "~\$*" \
        --exclude ".git/*" \
        --delete \
        --cache-control "max-age=86400" \
        || err "Error al sincronizar con S3"

    # HTML sin caché para que siempre carguen la versión más nueva
    info "Actualizando archivos HTML (sin caché)..."
    aws s3 sync "$FRONTEND_LOCAL" "s3://$S3_BUCKET" \
        --exclude "*" \
        --include "*.html" \
        --cache-control "no-cache, no-store, must-revalidate" \
        || warn "No se pudieron actualizar headers de HTML"

    log "Frontend sincronizado con S3"

    if [ -n "$CLOUDFRONT_DIST_ID" ]; then
        info "Invalidando caché de CloudFront..."
        local INV_ID
        INV_ID=$(aws cloudfront create-invalidation \
            --distribution-id "$CLOUDFRONT_DIST_ID" \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text)
        log "Invalidación creada: $INV_ID"
        info "La caché se actualizará en ~1-2 minutos"
    else
        warn "CLOUDFRONT_DIST_ID no configurado — no se invalidó la caché"
    fi

    log "Frontend desplegado correctamente"
}

# ── Check: estado de los servicios ────────────────────
check_services() {
    banner "Estado de servicios en EC2"

    check_config

    ssh -i "$EC2_KEY" \
        -o StrictHostKeyChecking=no \
        -o ConnectTimeout=10 \
        "$EC2_USER@$EC2_IP" \
        "
        echo '── PM2 ─────────────────────'
        pm2 status

        echo ''
        echo '── Health Check ────────────'
        curl -s http://localhost:3001/api/health || echo 'Backend no responde'

        echo ''
        echo '── Logs recientes ──────────'
        pm2 logs fl-snf-backend --lines 10 --nostream 2>/dev/null || true
        " || err "No se pudo conectar al EC2"
}

# ── Main ──────────────────────────────────────────────
case "${1:-all}" in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_backend
        deploy_frontend
        banner "Deploy completado"
        log "Backend : http://$EC2_IP:3001/api/health"
        [ -n "$S3_BUCKET" ] && log "Frontend: https://$S3_BUCKET.s3-website.amazonaws.com"
        [ -n "$CLOUDFRONT_DIST_ID" ] && log "CDN     : revisa tu URL de CloudFront"
        ;;
    check)
        check_services
        ;;
    *)
        echo ""
        echo "  Uso: $0 [backend|frontend|all|check]"
        echo ""
        echo "    backend   → empaqueta y despliega el backend en EC2"
        echo "    frontend  → sube el frontend a S3 e invalida CloudFront"
        echo "    all       → backend + frontend (default)"
        echo "    check     → muestra estado de PM2 y health check del EC2"
        echo ""
        exit 1
        ;;
esac

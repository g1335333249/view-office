#!/usr/bin/env bash
set -euo pipefail
set -f

export PORT="${PORT:-3000}"
export DATA_DIR="${DATA_DIR:-/data}"

if [ -n "${VIEW_OFFICE_HOST:-}" ]; then
  if [[ "${VIEW_OFFICE_HOST}" == http://* || "${VIEW_OFFICE_HOST}" == https://* ]]; then
    view_office_base="${VIEW_OFFICE_HOST%/}"
  else
    view_office_base="${VIEW_OFFICE_SCHEME:-http}://${VIEW_OFFICE_HOST}"
  fi
  export PUBLIC_URL="${PUBLIC_URL:-${view_office_base}:${PORT}}"
  export WOPI_PUBLIC_URL="${WOPI_PUBLIC_URL:-${view_office_base}:${PORT}}"
  export COLLABORA_PUBLIC_URL="${COLLABORA_PUBLIC_URL:-${view_office_base}:9980}"
  export aliasgroup1="${aliasgroup1:-${view_office_base}:${PORT}}"
else
  export PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT}}"
  export WOPI_PUBLIC_URL="${WOPI_PUBLIC_URL:-http://localhost:${PORT}}"
  export COLLABORA_PUBLIC_URL="${COLLABORA_PUBLIC_URL:-http://localhost:9980}"
  export aliasgroup1="${aliasgroup1:-http://localhost:${PORT}}"
fi

export COLLABORA_INTERNAL_URL="${COLLABORA_INTERNAL_URL:-http://127.0.0.1:9980}"
export username="${username:-admin}"
export password="${password:-admin}"
export COLLABORA_MEMPROPORTION="${COLLABORA_MEMPROPORTION:-95.0}"
export COLLABORA_LOAD_TIMEOUT_SECS="${COLLABORA_LOAD_TIMEOUT_SECS:-600}"
export COLLABORA_CONVERT_TIMEOUT_SECS="${COLLABORA_CONVERT_TIMEOUT_SECS:-600}"
export COLLABORA_CONNECTION_TIMEOUT_SECS="${COLLABORA_CONNECTION_TIMEOUT_SECS:-120}"
export COLLABORA_WOPI_MAX_FILE_SIZE="${COLLABORA_WOPI_MAX_FILE_SIZE:-0}"
export COLLABORA_PER_DOCUMENT_MAX_FILE_SIZE_MB="${COLLABORA_PER_DOCUMENT_MAX_FILE_SIZE_MB:-0}"
export COLLABORA_PER_DOCUMENT_MAX_VIRT_MEM_MB="${COLLABORA_PER_DOCUMENT_MAX_VIRT_MEM_MB:-0}"
export COLLABORA_BAD_DOC_MEMORY_MB="${COLLABORA_BAD_DOC_MEMORY_MB:-8192}"
export extra_params="${extra_params:---o:ssl.enable=false --o:ssl.termination=false --o:welcome.enable=false --o:net.frame_ancestors=* --o:net.post_allow.host[0]=.*}"
export VIEW_OFFICE_LOADING_TEXT="${VIEW_OFFICE_LOADING_TEXT:-正在加载，请稍候...}"
export VIEW_OFFICE_BRAND_NAME="${VIEW_OFFICE_BRAND_NAME:-}"
export VIEW_OFFICE_LOGO_URL="${VIEW_OFFICE_LOGO_URL:-}"
export VIEW_OFFICE_BRAND_URL="${VIEW_OFFICE_BRAND_URL:-#}"

write_branding_runtime() {
  node - <<'JS'
const fs = require('node:fs');
const config = {
  loadingText: process.env.VIEW_OFFICE_LOADING_TEXT || '正在加载，请稍候...',
  brandName: process.env.VIEW_OFFICE_BRAND_NAME || '',
  logoUrl: process.env.VIEW_OFFICE_LOGO_URL || '',
  brandUrl: process.env.VIEW_OFFICE_BRAND_URL || '#'
};
fs.writeFileSync(
  '/usr/share/coolwsd/browser/dist/view-office-branding-runtime.js',
  `window.ViewOfficeBranding = ${JSON.stringify(config)};\n`,
  'utf8'
);
JS
}

write_coolwsd_runtime_config() {
  node - <<'JS'
const fs = require('node:fs');

const configPath = '/etc/coolwsd/coolwsd.xml';
let xml = fs.readFileSync(configPath, 'utf8');

function setTag(tag, value) {
  const next = String(value ?? '').trim();
  if (!next) return;

  const pattern = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`);
  if (!pattern.test(xml)) {
    console.warn(`[view-office] coolwsd tag not found: ${tag}`);
    return;
  }
  xml = xml.replace(pattern, `$1${next}$3`);
}

setTag('memproportion', process.env.COLLABORA_MEMPROPORTION || '95.0');
setTag('limit_load_secs', process.env.COLLABORA_LOAD_TIMEOUT_SECS || '600');
setTag('limit_convert_secs', process.env.COLLABORA_CONVERT_TIMEOUT_SECS || '600');
setTag('connection_timeout_secs', process.env.COLLABORA_CONNECTION_TIMEOUT_SECS || '120');
setTag('max_file_size', process.env.COLLABORA_WOPI_MAX_FILE_SIZE || '0');
setTag('limit_file_size_mb', process.env.COLLABORA_PER_DOCUMENT_MAX_FILE_SIZE_MB || '0');
setTag('limit_virt_mem_mb', process.env.COLLABORA_PER_DOCUMENT_MAX_VIRT_MEM_MB || '0');
setTag('limit_dirty_mem_mb', process.env.COLLABORA_BAD_DOC_MEMORY_MB || '8192');

fs.writeFileSync(configPath, xml, 'utf8');
console.log('[view-office] coolwsd runtime limits applied');
JS
}

if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR}/files"
  write_branding_runtime
  write_coolwsd_runtime_config
  export VIEW_OFFICE_BRANDING_RUNTIME_WRITTEN=1
  export VIEW_OFFICE_COOLWSD_RUNTIME_WRITTEN=1
  chown -R cool:cool "${DATA_DIR}" /app
  exec su -m -s /bin/bash cool -c /usr/local/bin/start-all.sh
fi

mkdir -p "${DATA_DIR}/files"
if [ "${VIEW_OFFICE_BRANDING_RUNTIME_WRITTEN:-0}" != "1" ]; then
  write_branding_runtime
fi
if [ "${VIEW_OFFICE_COOLWSD_RUNTIME_WRITTEN:-0}" != "1" ] && [ -w /etc/coolwsd/coolwsd.xml ]; then
  write_coolwsd_runtime_config
fi

node /app/src/server.js &
preview_pid=$!

/start-collabora-online.sh &
collabora_pid=$!

shutdown() {
  kill "$preview_pid" "$collabora_pid" 2>/dev/null || true
  wait "$preview_pid" "$collabora_pid" 2>/dev/null || true
}

trap shutdown INT TERM

wait -n "$preview_pid" "$collabora_pid"
exit_code=$?
shutdown
exit "$exit_code"

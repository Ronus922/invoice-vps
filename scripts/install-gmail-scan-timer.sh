#!/usr/bin/env bash
# Install systemd timer + service for daily Gmail scan.
# Mirrors the pattern of invoice-backup.{timer,service}.
# Run once: sudo bash /var/www/invoice/scripts/install-gmail-scan-timer.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Must be run with sudo" >&2
  exit 1
fi

ENV_FILE="/etc/invoice/invoice.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE} — cannot read PORT/CRON_SECRET" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

PORT="${PORT:-3002}"

cat > /etc/systemd/system/invoice-gmail-scan.timer <<EOF
[Unit]
Description=Daily trigger for invoice Gmail scan

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/invoice-gmail-scan.service <<EOF
[Unit]
Description=InvoiceFlow - Daily Gmail scan
After=network-online.target invoice.service
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/curl -fsS -X POST -H "X-Cron-Secret: \${CRON_SECRET}" -H "Content-Type: application/json" --max-time 1800 -d "{}" http://127.0.0.1:${PORT}/api/scan-gmail
User=ubuntu
EOF

systemctl daemon-reload
systemctl enable --now invoice-gmail-scan.timer

echo "Installed and enabled invoice-gmail-scan.timer"
echo
systemctl list-timers invoice-gmail-scan.timer --no-pager
echo
echo "Trigger now:  sudo systemctl start invoice-gmail-scan.service"
echo "Tail logs:    journalctl -u invoice -f | grep scan-gmail"

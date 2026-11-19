#!/usr/bin/env bash
# Instala o Sistema No Grau numa VM Linux (Oracle Cloud), inclusive num servidor
# que JÁ TEM outros sistemas: não mexe nos outros sites, não troca o Node.js do
# servidor e não usa uma porta que já esteja ocupada.
#
# Uso:
#   sudo bash deploy/instalar-oracle.sh sistema.seudominio.com.br [demo.seudominio.com.br]
# Para escolher as portas internas (padrão 3000 e 3001):
#   sudo PORTA=3020 DEMO_PORTA=3021 bash deploy/instalar-oracle.sh sistema.seudominio.com.br
# SEM DOMÍNIO (acesso por http://IP-DO-SERVIDOR:PORTA, como outros sistemas do servidor):
#   sudo PORTA=3020 bash deploy/instalar-oracle.sh --sem-dominio
#   sudo PORTA=3020 DEMO_PORTA=3021 bash deploy/instalar-oracle.sh --sem-dominio --com-demo
set -euo pipefail
SEM_DOMINIO=""; DOMINIO=""; DEMO=""
if [ "${1:-}" = "--sem-dominio" ]; then
  SEM_DOMINIO=1
  if [ "${2:-}" = "--com-demo" ]; then DEMO=sim; fi
else
  DOMINIO="${1:?Informe o domínio (ex.: sistema.nograu.com.br) ou use --sem-dominio}"
  DEMO="${2:-}"
fi
# sem domínio o sistema atende direto na porta; com domínio, só por dentro (o Caddy/Nginx entrega)
if [ -n "$SEM_DOMINIO" ]; then HOST_SERVICO=0.0.0.0; COOKIE_SEGURO=0; else HOST_SERVICO=127.0.0.1; COOKIE_SEGURO=1; fi
PORTA="${PORTA:-3000}"
DEMO_PORTA="${DEMO_PORTA:-3001}"
ORIGEM="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO=/opt/nograu
NODE_VERSAO=22.14.0
[ "$(id -u)" = 0 ] || { echo "Rode com sudo."; exit 1; }

porta_ocupada() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }
servico_ativo() { systemctl is-active --quiet "$1" 2>/dev/null; }

# ---------- 1. conferências ----------
echo ">> Conferindo o servidor"
for p in "$PORTA" ${DEMO:+"$DEMO_PORTA"}; do
  if porta_ocupada "$p" && ! { servico_ativo nograu && [ "$p" = "$PORTA" ]; } && ! { servico_ativo nograu-demo && [ "$p" = "$DEMO_PORTA" ]; }; then
    echo "!! A porta $p já está em uso por outro sistema. Escolha outra, por exemplo:"
    echo "   sudo PORTA=3020 DEMO_PORTA=3021 bash deploy/instalar-oracle.sh ${SEM_DOMINIO:+--sem-dominio} $DOMINIO ${DEMO:+$([ -n "$SEM_DOMINIO" ] && echo --com-demo || echo "$DEMO")}"
    exit 1
  fi
done
WEB=""
if [ -n "$SEM_DOMINIO" ]; then WEB=nenhum-necessario
elif servico_ativo nginx; then WEB=nginx
elif servico_ativo caddy || command -v caddy >/dev/null; then WEB=caddy
elif servico_ativo apache2 || servico_ativo httpd; then
  echo "!! Este servidor usa Apache. Instale o sistema com PORTA livre e me peça a configuração do Apache."; exit 1
fi
if [ -n "$SEM_DOMINIO" ]; then echo "   Sem domínio: o No Grau atende direto na porta $PORTA (Caddy/Nginx não são alterados)"
else echo "   Servidor web encontrado: ${WEB:-nenhum (vou instalar o Caddy)}"; fi

# ---------- 2. Node.js próprio do No Grau (não mexe no Node do servidor) ----------
NODE_BIN=""
if command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  NODE_BIN="$(command -v node)"
  echo "   Usando o Node.js do servidor: $(node -v)"
else
  case "$(uname -m)" in x86_64) ARQ=x64;; aarch64|arm64) ARQ=arm64;; *) echo "!! Processador não suportado: $(uname -m)"; exit 1;; esac
  if [ ! -x "$DESTINO/node/bin/node" ]; then
    echo ">> Baixando Node.js $NODE_VERSAO só para o No Grau (o Node do servidor não é alterado)"
    command -v xz >/dev/null || { apt-get update -y && apt-get install -y xz-utils; }
    mkdir -p "$DESTINO/node"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSAO/node-v$NODE_VERSAO-linux-$ARQ.tar.xz" | tar -xJ -C "$DESTINO/node" --strip-components=1
  fi
  NODE_BIN="$DESTINO/node/bin/node"
fi

# ---------- 3. arquivos e usuário ----------
echo ">> Copiando o sistema para $DESTINO (os dados em $DESTINO/dados são preservados)"
id nograu >/dev/null 2>&1 || useradd --system --home "$DESTINO" --shell /usr/sbin/nologin nograu
mkdir -p "$DESTINO/dados"
if [ "$ORIGEM" != "$DESTINO" ]; then
  cp -r "$ORIGEM"/server.js "$ORIGEM"/db.js "$ORIGEM"/pdf.js "$ORIGEM"/package.json "$ORIGEM"/demo.js "$ORIGEM"/demo "$ORIGEM"/public "$DESTINO"/
fi
chown -R nograu:nograu "$DESTINO"

# ---------- 4. serviços ----------
criar_servico() { # nome porta script descrição extra
  cat > "/etc/systemd/system/$1.service" <<EOF
[Unit]
Description=$4
After=network.target

[Service]
Type=simple
User=nograu
WorkingDirectory=$DESTINO
Environment=PORT=$2
Environment=HOST=$HOST_SERVICO
Environment=COOKIE_SECURE=$COOKIE_SEGURO
ExecStart=$NODE_BIN $3
Restart=always
RestartSec=3
$5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload && systemctl enable "$1" >/dev/null 2>&1 && systemctl restart "$1"
}
echo ">> Serviço do sistema na porta interna $PORTA"
criar_servico nograu "$PORTA" server.js "Sistema No Grau" ""
if [ -n "$DEMO" ]; then
  echo ">> Demonstração na porta interna $DEMO_PORTA (reinicia sozinha todo dia)"
  criar_servico nograu-demo "$DEMO_PORTA" demo.js "Sistema No Grau - demonstracao" "RuntimeMaxSec=1d"
fi
sleep 2
curl -fsS "http://127.0.0.1:$PORTA/api/status" >/dev/null || { echo "!! O sistema não respondeu. Veja: sudo journalctl -u nograu -n 50"; exit 1; }

# ---------- 5. site com HTTPS (sem mexer nos outros sites) ----------
if [ -n "$SEM_DOMINIO" ]; then
  echo ">> Sem domínio: nenhuma configuração de Caddy/Nginx é feita"
elif [ "$WEB" = nginx ]; then
  echo ">> Configurando o Nginx para $DOMINIO ${DEMO:+e $DEMO}"
  bloco() { cat <<EOF
server {
    listen 80;
    server_name $1;
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:$2;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  }
  { bloco "$DOMINIO" "$PORTA"; if [ -n "$DEMO" ]; then bloco "$DEMO" "$DEMO_PORTA"; fi; } > /etc/nginx/sites-available/nograu
  ln -sf /etc/nginx/sites-available/nograu /etc/nginx/sites-enabled/nograu
  nginx -t && systemctl reload nginx
  if command -v certbot >/dev/null; then
    certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMINIO" ${DEMO:+-d "$DEMO"} || echo "!! O certificado HTTPS falhou. Confira se o domínio já aponta para este servidor e rode: sudo certbot --nginx -d $DOMINIO"
  else
    echo "!! O certbot não está instalado. Para ativar o HTTPS: sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d $DOMINIO ${DEMO:+-d $DEMO}"
  fi
else
  if ! command -v caddy >/dev/null; then
    echo ">> Instalando o Caddy"
    apt-get update -y && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
  fi
  CF=/etc/caddy/Caddyfile
  touch "$CF"; cp "$CF" "$CF.antes-nograu.$(date +%Y%m%d%H%M%S)"   # cópia de segurança
  # remove só o bloco antigo do No Grau (se existir) e adiciona o novo no fim; os outros sites ficam como estão
  sed -i '/^# >>> No Grau/,/^# <<< No Grau/d' "$CF"
  {
    echo "# >>> No Grau (gerado pelo instalador)"
    printf '%s {\n    reverse_proxy 127.0.0.1:%s\n}\n' "$DOMINIO" "$PORTA"
    if [ -n "$DEMO" ]; then printf '%s {\n    reverse_proxy 127.0.0.1:%s\n}\n' "$DEMO" "$DEMO_PORTA"; fi
    echo "# <<< No Grau"
  } >> "$CF"
  echo ">> Configurando o Caddy para $DOMINIO ${DEMO:+e $DEMO} (cópia do arquivo anterior em $CF.antes-nograu.*)"
  caddy validate --config "$CF" --adapter caddyfile >/dev/null && systemctl reload caddy || { echo "!! Erro na configuração do Caddy; o arquivo anterior está salvo ao lado."; exit 1; }
fi

# ---------- 6. firewall da VM ----------
if [ -n "$SEM_DOMINIO" ]; then PORTAS_ABRIR="$PORTA${DEMO:+ $DEMO_PORTA}"; else PORTAS_ABRIR="80 443"; fi
echo ">> Liberando no firewall da VM a(s) porta(s): $PORTAS_ABRIR"
if command -v iptables >/dev/null; then
  for p in $PORTAS_ABRIR; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null && continue
    # entra logo antes do REJECT padrão das imagens da Oracle (ou no fim, se não houver)
    pos=$(iptables -L INPUT --line-numbers -n 2>/dev/null | awk '$2=="REJECT" {print $1; exit}')
    if [ -n "$pos" ]; then iptables -I INPUT "$pos" -p tcp --dport "$p" -j ACCEPT 2>/dev/null; else iptables -A INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null; fi \
      || echo "!! Não consegui liberar a porta $p no firewall da VM. Me mande a saída de: sudo iptables -L INPUT --line-numbers -n"
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true
  else echo "!! Para a regra valer depois de reiniciar a VM: sudo apt install -y iptables-persistent"; fi
fi

echo
if [ -n "$SEM_DOMINIO" ]; then
  IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo "IP-DO-SERVIDOR")
  echo "Pronto! Acesse http://$IP:$PORTA"
  if [ -n "$DEMO" ]; then echo "Demonstração: http://$IP:$DEMO_PORTA"; fi
  echo
  echo "IMPORTANTE: no painel da Oracle, libere a porta $PORTA${DEMO:+ e a $DEMO_PORTA}:"
  echo "  Networking > Virtual Cloud Networks > (sua VCN) > Security Lists > Default > Add Ingress Rules"
  echo "  Source CIDR 0.0.0.0/0 · IP Protocol TCP · Destination Port Range $PORTA${DEMO:+,$DEMO_PORTA}"
else
  echo "Pronto! Acesse https://$DOMINIO"
  if [ -n "$DEMO" ]; then echo "Demonstração: https://$DEMO"; fi
  echo "Lembre de liberar as portas 80 e 443 na Security List da VCN, no painel da Oracle (se ainda não estiverem)."
fi

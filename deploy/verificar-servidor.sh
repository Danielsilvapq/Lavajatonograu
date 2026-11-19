#!/usr/bin/env bash
# Mostra como o servidor está montado antes de instalar o No Grau.
# Só lê informações: não instala, não altera e não reinicia nada.
# Uso: sudo bash deploy/verificar-servidor.sh
porta_ocupada() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }
linha() { printf '%-26s %s\n' "$1" "$2"; }

echo "================ Servidor ================"
linha "Sistema:" "$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-desconhecido}")"
linha "Processador:" "$(uname -m)"
linha "Memória (total/livre):" "$(free -h | awk '/Mem:/ {print $2 " / " $7}')"
linha "Disco / (livre):" "$(df -h / | awk 'NR==2 {print $4 " de " $2}')"
if command -v node >/dev/null; then
  linha "Node.js do servidor:" "$(node -v)"
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
    linha "" "serve para o No Grau"
  else
    linha "" "antigo para o No Grau: o instalador baixa um Node separado (o do servidor não muda)"
  fi
else
  linha "Node.js do servidor:" "não instalado (o instalador baixa um só para o No Grau)"
fi

echo; echo "============= Servidor web ==============="
for s in nginx caddy apache2 httpd; do systemctl is-active --quiet "$s" 2>/dev/null && linha "$s:" "ATIVO"; done
if [ -f /etc/caddy/Caddyfile ]; then
  echo "Sites no Caddy:"; grep -E '^[^#[:space:]].*\{' /etc/caddy/Caddyfile | sed 's/[[:space:]]*{.*//; s/^/  - /'
  echo "Encaminhamentos (porta interna):"; grep -Eo 'reverse_proxy[^#]*' /etc/caddy/Caddyfile | sed 's/^/  - /'
fi
if [ -d /etc/nginx/sites-enabled ]; then
  echo "Sites no Nginx:"; grep -hEo 'server_name[^;]*' /etc/nginx/sites-enabled/* 2>/dev/null | sed 's/server_name/  -/' | sort -u
  echo "Encaminhamentos (porta interna):"; grep -hEo 'proxy_pass[^;]*' /etc/nginx/sites-enabled/* 2>/dev/null | sed 's/^/  - /' | sort -u
fi
command -v certbot >/dev/null && linha "certbot:" "instalado"

echo; echo "======= Portas em uso (programas) ========"
ss -ltnpH 2>/dev/null | awk '{print $4, $6}' | sed -E 's/users:\(\("([^"]+)".*/\1/' | sort -u | sed 's/^/  /'

echo; echo "============== Sugestão ================="
livres=(); p=3020
while [ ${#livres[@]} -lt 2 ] && [ $p -lt 3100 ]; do porta_ocupada $p || livres+=("$p"); p=$((p + 1)); done
if systemctl is-active --quiet nograu 2>/dev/null; then echo "  O No Grau JÁ está instalado aqui (serviço nograu ativo)."; fi
echo "  Portas livres para o No Grau: ${livres[0]} (sistema) e ${livres[1]} (demonstração)"
echo "  Comando sugerido:"
echo "    sudo PORTA=${livres[0]} DEMO_PORTA=${livres[1]} bash deploy/instalar-oracle.sh SEU-DOMINIO [DOMINIO-DA-DEMO]"
echo
echo "Copie tudo acima e mande para o Claude conferir antes de instalar."

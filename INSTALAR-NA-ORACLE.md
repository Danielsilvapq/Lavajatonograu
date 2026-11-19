# Como colocar o No Grau no ar na Oracle (sem domínio)

Este guia instala o No Grau no **mesmo servidor do beach e do Connect Lava Jato**, com a **mesma chave de acesso**. O sistema vai abrir pelo endereço `http://IP-DO-SERVIDOR:PORTA`.

O instalador **não mexe nos outros sistemas**:
- não altera o Caddy nem o Nginx;
- não troca o Node.js do servidor;
- não usa uma porta que já esteja ocupada.

Tempo estimado: **15 a 20 minutos**.

---

## Antes de começar: o que você precisa ter em mãos

| O quê | Onde encontrar |
|---|---|
| **IP público do servidor** | É o mesmo do beach. Ou no painel da Oracle: *Compute → Instances →* clique na instância → **Public IP address** |
| **Arquivo da chave** (`.key` ou `.pem`) | O mesmo que você usa para entrar no servidor do beach |
| **Usuário do servidor** | Normalmente `ubuntu`. Se o servidor for Oracle Linux, é `opc`. Use o mesmo de sempre |

Nos comandos abaixo, troque:
- `IP_DO_SERVIDOR` pelo IP (ex.: `150.230.10.20`);
- `C:\caminho\da\chave.key` pelo caminho real do arquivo da chave.

---

## Passo 1: entrar no servidor

### No Windows
1. Aperte a tecla **Windows**, digite **PowerShell** e abra.
2. Digite (trocando o caminho e o IP):
   ```
   ssh -i C:\caminho\da\chave.key ubuntu@IP_DO_SERVIDOR
   ```
3. Se perguntar `Are you sure you want to continue connecting (yes/no)?`, digite **yes** e Enter.

### No Mac ou Linux
1. Abra o **Terminal**.
2. Digite:
   ```
   ssh -i ~/caminho/da/chave.key ubuntu@IP_DO_SERVIDOR
   ```

**Deu certo quando** aparecer algo como `ubuntu@nome-do-servidor:~$`. A partir daqui, todos os comandos são digitados nessa janela.

<details>
<summary><b>Deu erro? Clique aqui</b></summary>

- **`UNPROTECTED PRIVATE KEY FILE` / `bad permissions`**: a chave está com permissão aberta demais.
  - No Windows (PowerShell), rode os dois comandos abaixo e tente de novo:
    ```
    icacls "C:\caminho\da\chave.key" /inheritance:r
    icacls "C:\caminho\da\chave.key" /grant:r "$($env:USERNAME):(R)"
    ```
  - No Mac/Linux: `chmod 600 ~/caminho/da/chave.key`
- **`Permission denied (publickey)`**: o usuário ou a chave estão errados. Tente `opc` no lugar de `ubuntu` e confira se é a mesma chave do beach.
- **`Connection timed out`**: confira o IP. Se o beach abre normalmente, o IP deve ser o mesmo.
</details>

---

## Passo 2: baixar o No Grau no servidor

Copie e cole (no PowerShell, o botão direito do mouse cola):

```
git clone https://github.com/Danielsilvapq/Lavajatonograu.git ~/lavajatonograu
```

**Deu certo quando** aparecer `Cloning into...` e depois a linha de comando de volta, sem `fatal`.

- Se aparecer `git: command not found`, instale o git e repita o comando acima:
  ```
  sudo apt update && sudo apt install -y git
  ```
- Se aparecer `already exists`, o No Grau já foi baixado antes. Atualize com:
  ```
  cd ~/lavajatonograu && git pull
  ```

---

## Passo 3: conferir o servidor (não muda nada)

```
cd ~/lavajatonograu && sudo bash deploy/verificar-servidor.sh
```

Ele mostra 4 blocos:
1. **Servidor**: sistema, memória, disco e Node.js.
2. **Servidor web**: se usa Caddy ou Nginx e os sites cadastrados (deve aparecer o beach e o Connect).
3. **Portas em uso**: as portas que o beach, o Connect e os outros programas já ocupam.
4. **Sugestão**: portas livres para o No Grau e o comando de instalação.

**Anote as duas portas sugeridas** (por exemplo `3020` e `3021`). A primeira é do sistema, a segunda é da demonstração.

Na dúvida, copie toda a saída e mande para o Claude conferir antes de seguir.

---

## Passo 4: instalar

Use as portas que o Passo 3 sugeriu. No exemplo abaixo são 3020 e 3021:

**Com a demonstração** (o sistema de verdade + a versão com dados fictícios para mostrar a clientes):
```
sudo PORTA=3020 DEMO_PORTA=3021 bash deploy/instalar-oracle.sh --sem-dominio --com-demo
```

**Só o sistema**, sem a demonstração:
```
sudo PORTA=3020 bash deploy/instalar-oracle.sh --sem-dominio
```

O instalador mostra o que está fazendo, linha por linha. **Deu certo quando** terminar assim:
```
Pronto! Acesse http://150.230.10.20:3020
Demonstração: http://150.230.10.20:3021

IMPORTANTE: no painel da Oracle, libere a porta 3020 e a 3021:
```

| Se aparecer... | O que fazer |
|---|---|
| `!! A porta 3020 já está em uso` | Rode de novo com outras portas, ex.: `PORTA=3030 DEMO_PORTA=3031` |
| `!! O sistema não respondeu` | Rode `sudo journalctl -u nograu -n 50` e mande a saída para o Claude |
| `!! Não consegui liberar a porta ... no firewall` | Rode o comando que ele sugerir, ou mande a mensagem para o Claude |
| `!! Para a regra valer depois de reiniciar` | Rode `sudo apt install -y iptables-persistent` e responda **Yes** nas duas perguntas |

---

## Passo 5: liberar a porta no painel da Oracle

O servidor já está rodando o No Grau, mas a Oracle bloqueia as portas por fora. É **o mesmo lugar onde você liberou a porta do beach**.

1. Entre em **https://cloud.oracle.com** com o seu login.
2. Abra o menu **☰** (canto superior esquerdo) → **Networking** → **Virtual Cloud Networks**.
3. Clique na **VCN** do servidor. Se houver mais de uma, é a mesma do beach.
4. No menu da esquerda (ou na aba **Security**), clique em **Security Lists** → **Default Security List for ...**
5. Clique em **Add Ingress Rules** e preencha:
   - **Source Type:** CIDR
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Source Port Range:** deixe vazio
   - **Destination Port Range:** `3020,3021` (as suas portas, separadas por vírgula; só a primeira se não instalou a demo)
   - **Description:** `No Grau`
6. Clique em **Add Ingress Rules** para salvar.

Se, ao abrir a regra do beach, você vir que ela foi criada num **Network Security Group** (NSG) e não na Security List, crie a regra do No Grau nesse mesmo NSG: *Compute → Instances →* sua instância *→ Network Security Groups*.

---

## Passo 6: abrir e criar o acesso do dono

1. No navegador (computador ou celular), abra: `http://IP_DO_SERVIDOR:3020`
2. Na primeira vez, aparece **"Bem-vindo! Crie o acesso do dono"**. Preencha nome, login e senha (mínimo 6 caracteres) e clique em **Começar a usar**.
3. Pronto: o sistema está no ar.

A demonstração fica em `http://IP_DO_SERVIDOR:3021`, com os botões **Entrar como dono** e **Entrar como funcionário**.

**Confira que o beach e o Connect continuam abrindo normalmente.**

<details>
<summary><b>Não abriu? Clique aqui</b></summary>

Siga na ordem, sempre no servidor:
1. **O sistema está rodando?** Deve aparecer `active (running)` em verde:
   ```
   sudo systemctl status nograu --no-pager
   ```
2. **Ele responde dentro do servidor?** (troque 3020 pela sua porta) Deve aparecer um texto com `precisaSetup`:
   ```
   curl http://127.0.0.1:3020/api/status
   ```
3. **O firewall da VM está liberado?** Deve aparecer uma linha com `ACCEPT ... dpt:3020` **antes** da linha `REJECT`:
   ```
   sudo iptables -L INPUT -n --line-numbers
   ```
4. **A regra no painel da Oracle (Passo 5) foi salva** com a porta certa?

Se os itens 1 e 2 funcionam e mesmo assim não abre pelo navegador, quase sempre o problema é o Passo 5.
</details>

---

## Passo 7: configurar para o dia a dia

Entre como dono e faça, nesta ordem:

1. **Configurações**: nome do lava jato, **CNPJ** (o sistema busca o endereço sozinho), telefone, condições impressas na OS e as mensagens de WhatsApp.
2. **Serviços e preços**: ajuste os preços por porte (pequeno, médio, grande, moto). Em cada serviço, informe também **quanto de cada produto ele gasta**, para o estoque baixar sozinho.
3. **Equipe**: crie um login para cada funcionário, com a **% de comissão**.
4. **Estoque**: cadastre os produtos, com a quantidade atual e o estoque mínimo.
5. **Planos mensais**: se houver.
6. Faça uma **OS de teste** do começo ao fim. Depois, exclua-a pela tela da OS.

---

## Comandos úteis (guarde esta parte)

Entre no servidor (Passo 1) e use:

| Para... | Comando |
|---|---|
| Ver se está rodando | `sudo systemctl status nograu --no-pager` |
| Ver os últimos erros | `sudo journalctl -u nograu -n 50 --no-pager` |
| Reiniciar o sistema | `sudo systemctl restart nograu` |
| Reiniciar a demonstração (volta aos dados originais) | `sudo systemctl restart nograu-demo` |
| **Atualizar** para a versão nova do GitHub (os dados ficam) | `cd ~/lavajatonograu && git pull && sudo PORTA=3020 DEMO_PORTA=3021 bash deploy/instalar-oracle.sh --sem-dominio --com-demo` |

Na atualização, use **as mesmas portas da instalação**. Se instalou sem a demo, tire o `DEMO_PORTA=...` e o `--com-demo`.

### Onde ficam os dados
- **Banco de dados e fotos:** `/opt/nograu/dados`
- **Backup automático diário:** `/opt/nograu/dados/backups` (banco dos últimos 30 dias e cópia das fotos)
- **Backup manual:** no sistema, entre em *Configurações → Baixar backup completo*. Faça isso **toda semana** e guarde no Google Drive ou num pendrive. O backup no próprio servidor não protege contra a VM ser apagada.

### Retirar o No Grau do servidor (só se um dia precisar)
Os dados em `/opt/nograu/dados` **não** são apagados por estes comandos:
```
sudo systemctl disable --now nograu nograu-demo
sudo rm /etc/systemd/system/nograu.service /etc/systemd/system/nograu-demo.service
sudo systemctl daemon-reload
```

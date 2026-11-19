# Sistema No Grau — Lava Jato

Sistema de gestão para o lava jato, que roda pelo navegador (computador e celular).

**O que tem:**
- Painel do dia com as etapas aguardando, lavando, pronto e entregue
- Ordens de serviço com preço automático pelo porte do carro
- Agenda
- Clientes e veículos com histórico
- Caixa com fechamento do dia
- Despesas
- Relatórios, incluindo comissão da equipe
- Estoque: produtos de uso e de venda, compras, vendas no balcão, contagem e aviso de estoque baixo. O estoque baixa sozinho pelo que cada serviço gasta.
- Planos mensais
- Aviso pelo WhatsApp quando o carro fica pronto
- Impressão de comprovante
- Backup automático

Não precisa instalar nada além do **Node.js** (versão 22.13 ou mais nova). O banco de dados fica na pasta `dados/`.

---

## 1. No computador do balcão (Windows, funciona sem internet)

1. Instale o **Node.js LTS**: https://nodejs.org (é só ir clicando em "Avançar").
2. Copie a pasta `nograu` para o computador, por exemplo em `C:\nograu`.
3. Dê dois cliques em **`iniciar-windows.bat`**. O navegador abre sozinho em `http://localhost:3000`.
4. No primeiro acesso, crie o login do **dono**.
5. Para abrir o sistema no **celular dos funcionários**, conecte o celular no mesmo Wi-Fi e use o endereço "Na rede", que aparece na janela preta (por exemplo `http://192.168.0.10:3000`).
   - Se o Windows perguntar sobre o Firewall, clique em **Permitir**.

**Dicas:**
- Deixe a janela preta aberta enquanto usa o sistema. Se fechar, o sistema para.
- Para o sistema abrir junto com o Windows: aperte `Win + R`, digite `shell:startup` e coloque ali um atalho para o `iniciar-windows.bat`.
- Os backups ficam em `dados\backups`: o banco dos últimos 30 dias e uma cópia de todas as fotos. Mesmo assim, copie de vez em quando para um pendrive ou para o Google Drive.
- As fotos dos veículos ficam em `dados\fotos`.

---

## 2. Online, no servidor da Oracle Cloud

Pré-requisitos:
- Uma VM **Ubuntu** na Oracle Cloud (a Always Free serve).
- Um **domínio** apontando para o IP público da VM, por exemplo um registro `A` para `sistema.seudominio.com.br`.

1. **Libere as portas no painel da Oracle:** vá em Networking → Virtual Cloud Networks → sua VCN → Security Lists → Default → *Add Ingress Rules*. Crie as regras para as portas **80** e **443** com origem `0.0.0.0/0`.
2. **Envie a pasta para a VM.** No seu computador, rode:
   ```bash
   scp -r nograu ubuntu@IP_DA_VM:~
   ```
3. **Na VM**, rode o instalador com o seu domínio:
   ```bash
   cd ~/nograu
   sudo bash deploy/instalar-oracle.sh sistema.seudominio.com.br
   ```
   O instalador:
   - instala o Node.js e o Caddy;
   - cria o serviço, que reinicia sozinho se a VM reiniciar;
   - gera o certificado **HTTPS** automaticamente;
   - abre as portas no firewall da VM.
4. Acesse `https://sistema.seudominio.com.br` e crie o login do dono.

**Servidor que já tem outros sistemas** (ex.: o mesmo servidor de outros sites): o instalador foi feito para conviver com eles.
- **Não mexe nos outros sites:** com Caddy, só adiciona o bloco do No Grau no fim do Caddyfile e guarda uma cópia do arquivo anterior. Com Nginx, cria um arquivo próprio em `sites-available/nograu`.
- **Não troca o Node.js do servidor:** se a versão instalada for antiga, baixa um Node.js separado só para o No Grau.
- **Não usa porta ocupada:** se a 3000 já estiver em uso, ele para e avisa. Escolha outras portas assim:
  ```bash
  sudo PORTA=3020 DEMO_PORTA=3021 bash deploy/instalar-oracle.sh sistema.seudominio.com.br demo.seudominio.com.br
  ```

**Comandos úteis na VM:**
```bash
sudo systemctl status nograu      # ver se está rodando
sudo journalctl -u nograu -f      # ver os logs
sudo systemctl restart nograu     # reiniciar
```

**Atualizar o sistema depois:** envie os arquivos novos (`server.js`, `db.js`, `pdf.js`, `public/`) para `/opt/nograu` e rode `sudo systemctl restart nograu`. Os dados em `/opt/nograu/dados` não são apagados.

---

## Versão de demonstração

Serve para mostrar o sistema a alguém sem expor os dados reais. Ela já vem preenchida com dados fictícios: 2 meses de lavagens, clientes, empresas com CNPJ, carros com fotos e avarias, planos, caixa e relatórios. As datas acompanham o dia de hoje.

- **No computador:** dê dois cliques em `iniciar-demo-windows.bat`. O navegador abre em `http://localhost:3001`. A demonstração roda separada do sistema de verdade (que usa a porta 3000 e a pasta `dados`) e guarda tudo na pasta `dados-demo`.
- **Na tela de login** há os botões **Entrar como dono** e **Entrar como funcionário**. Os logins também funcionam à mão: `dono`, `carlos` ou `bruno`, todos com a senha `demo123`.
- **Tudo volta ao original sempre que a demonstração é reiniciada.** Quem testar pode criar, editar e apagar à vontade.
- Na demonstração, o WhatsApp abre para você escolher o contato, em vez de mandar a mensagem para os telefones fictícios. Também não é possível trocar senhas nem mexer na equipe.
- **Online na Oracle (opcional):** crie um subdomínio para a demo (ex.: `demo.seudominio.com.br`) apontando para a VM e rode o instalador com os dois domínios:
  ```bash
  sudo bash deploy/instalar-oracle.sh sistema.seudominio.com.br demo.seudominio.com.br
  ```
  A demonstração online se reinicia sozinha uma vez por dia.

## Balcão e online ao mesmo tempo

Cada instalação tem os **seus próprios dados**. Escolha uma destas formas de trabalhar:
- **Só online:** todos usam o endereço do servidor da Oracle. Precisa de internet no lava jato.
- **Só balcão:** funciona sem internet, mas só dentro do Wi-Fi do lava jato.
- **Mover de um para o outro:** baixe o backup em *Configurações → Baixar backup completo*. Você recebe um arquivo `.tar` com o banco e as fotos. Na outra instalação, com o sistema desligado, extraia esse arquivo dentro da pasta `dados`:
  - No Windows, abra o Prompt de Comando dentro da pasta `dados` e rode `tar -xf nograu-backup-AAAA-MM-DD.tar`. O 7-Zip também abre esse arquivo.
  - No Linux, rode `tar -xf nograu-backup-AAAA-MM-DD.tar -C /opt/nograu/dados` e depois `sudo chown -R nograu:nograu /opt/nograu/dados`.

A sincronização automática entre o balcão e o online pode ser adicionada numa próxima etapa.

## Consulta de CNPJ

Ao digitar um CNPJ completo no cadastro de um cliente, o sistema busca os dados na Receita: razão social, endereço, telefone e e-mail. Os campos vazios são preenchidos sozinhos.
- A consulta **precisa de internet**. Sem internet, o sistema avisa e você preenche à mão; o resto continua funcionando.
- O sistema usa serviços públicos e gratuitos (BrasilAPI, CNPJ.ws e ReceitaWS). Se um estiver fora do ar, tenta o próximo.
- Esses serviços têm limite de consultas por minuto, o que é suficiente para o uso normal de um lava jato.

## Quem acessa o quê

| Função | Funcionário | Dono |
|---|---|---|
| Painel, OS, agenda, clientes | ✔ | ✔ |
| Receber pagamento de OS | ✔ | ✔ |
| Caixa, despesas, relatórios, planos | | ✔ |
| Equipe, preços, configurações | | ✔ |
| Excluir OS e estornar pagamento | | ✔ |

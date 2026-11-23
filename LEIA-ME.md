# Meus Canais: painel de estatísticas

Painel com as estatísticas dos 4 canais de cortes. Abre no PC e no celular, de qualquer lugar.

- **Coletor** (`coletor/coletar.mjs`): pega no YouTube os inscritos, as views e os últimos 250 vídeos de cada canal.
- **Painel** (`site/`): mostra inscritos, views ganhas em 24 h / 7 dias / 30 dias, os cortes em alta e um gráfico de crescimento.
- **GitHub Actions** (`.github/workflows/coletar.yml`): roda o coletor a cada 3 horas na nuvem e publica o painel. O PC pode ficar desligado.

Os canais ficam em `canais.json`. Para trocar nome, cor ou @, ou para pôr o @ do TikTok, edite esse arquivo.

---

## Passo 1: criar a chave da API do YouTube (grátis, uns 5 minutos)

1. Entre em https://console.cloud.google.com com qualquer conta Google.
2. No topo, clique em **Selecionar projeto → Novo projeto**, dê o nome `meus-canais` e clique em **Criar**.
3. No menu, vá em **APIs e serviços → Biblioteca**, procure **YouTube Data API v3** e clique em **Ativar**.
4. Vá em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
5. Copie a chave (começa com `AIza…`).
6. Recomendado: clique na chave → **Restrições de API** → marque só a *YouTube Data API v3* → **Salvar**.

> A chave só lê dados **públicos**, os mesmos que qualquer pessoa vê no canal. Ela não dá acesso às suas contas.
> O limite grátis é de 10.000 unidades por dia. Cada coleta gasta umas 20.

## Passo 2: testar no PC (opcional)

Crie um arquivo `.env` nesta pasta com a linha:

```
YT_API_KEY=AIza...sua-chave...
```

Depois rode estes dois comandos:

```powershell
node coletor/coletar.mjs
```

```powershell
node ferramentas/servidor.mjs
```

e abra http://localhost:5180

O `.env` não vai para o GitHub, porque está no `.gitignore`.

## Passo 3: colocar na nuvem (GitHub, grátis)

1. Crie uma conta em https://github.com, se ainda não tiver.
2. Crie um repositório novo (**New repository**), por exemplo `meus-canais`, como **Public**.
   O GitHub Pages grátis só publica repositórios públicos. Os números já são públicos no YouTube.
3. Envie esta pasta para o repositório. O jeito mais fácil é pelo **GitHub Desktop** (Add local repository → Publish),
   ou arrastando os arquivos em *Add file → Upload files*. A pasta `.github` precisa ir junto.
4. No repositório, vá em **Settings → Secrets and variables → Actions → New repository secret**.
   Nome: `YT_API_KEY`. Valor: a chave do passo 1.
5. Vá em **Settings → Pages**. Em *Source*, escolha **GitHub Actions**.
6. Vá em **Actions → Coletar estatísticas e publicar painel → Run workflow**.
   Em 1 a 2 minutos, o endereço do painel aparece no resultado: `https://SEU-USUARIO.github.io/meus-canais/`.

Depois disso, ele roda sozinho a cada 3 horas.

## Passo 4: instalar no celular

- **Android (Chrome):** abra o endereço → menu ⋮ → **Adicionar à tela inicial / Instalar app**.
- **iPhone (Safari):** abra o endereço → botão Compartilhar → **Adicionar à Tela de Início**.

O app abre em tela cheia, como um aplicativo. Se estiver sem internet, ele mostra os últimos dados que carregou.

---

## Bom saber

- Os números de "no período" dependem do histórico. Nos primeiros dias, o app conta desde a primeira coleta e marca com `*`.
- O YouTube arredonda inscritos acima de 1.000 (1.234 vira 1,23 mil).
- As views de Shorts aparecem na API com um pequeno atraso em relação ao YouTube Studio.

## Próximas etapas

- **TikTok:** precisa registrar um app em https://developers.tiktok.com (Display API) e esperar a aprovação.
  Depois disso, entram seguidores, curtidas e views por vídeo.
- **YouTube Analytics** (tempo assistido, retenção, origem do tráfego): exige login (OAuth) em cada uma das 4 contas Google.

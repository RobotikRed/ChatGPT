# chatgpt-bot

A discord bot for interact with ChatGPT

## Setup Guide

1. Clone repository

```bash
    git clone https://github.com/MrlolDev/chatgpt-discord-bot.git
```

<details>
<summary>Running on your local machine</summary>
> **Note**
> This option doesn't work for server such as vps or bot hosting, to this type of machines read the guide of docker.
2. Install dependencies.

```bash
    npm install
```

3. Create a new .env file

```
# .env

TOKEN=Discord token id(https://discord.dev)
CLIENT_ID=Discord client id(https://discord.dev)
SUPABASE_KEY=Supabase key(https://app.supabase.com)
SUPABASE_URL=Supabase url(https://app.supabase.com)
SESSION_TOKEN="replace with your open ai session key"
API_TOKEN=Get it from https://justbrowse.io
```

4. Run the bot

```
    node .
```

</details>
<details>
<summary>Running with docker</summary>
</details>

## Get session key

1. Go to https://chat.openai.com/chat
2. Log in to your account
3. Open developer tools
4. Go to the application section
5. Go to the cookies section
6. And get your session token which is the cookie with the name: "\_\_Secure-next-auth.session-token"

## TO DO:

- [x] Chat command with ChatGPT response. --> 0.0.2
- [x] Conversations support(the bot have context from the previous messages). --> 0.0.3
- [x] Bot command(get information about the bot and the ping bot). --> 0.0.3
- [x] Feedback command(allow people to send feedback). --> 0.0.4
- [x] Auto refresh session token --> 0.0.5
- [x] Includes user message in chat command. --> 0.0.6
- [x] Solve ChatGPT issues --> 0.0.6
- [x] Limits to 1 conversation per channel. --> 0.0.6
- [x] Host on vps server --> 0.0.7
- [ ] Allow private conversations --> 0.0.9
- [ ] Embeds --> 0.0.9
- [ ] Top.gg rewards --> Future
- [ ] Partials responses during loading --> Future
- [ ] Uptime Robot alerts --> Future

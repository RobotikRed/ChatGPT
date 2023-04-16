<h1 align="center"><b>Turing</b> - <i>Discord bot</i></h1>
<p align="center"><i>The ultimate Discord bot, integrating various AIs</i></p>


## Requirements
### *OpenAI*
To set up this bot yourself, you will need an [**OpenAI API key**](https://platform.openai.com/account/api-keys), with a connected credit card.

### *Replicate*
To generate & view images, the bot uses various models from **[Replicate](https://replicate.com)**. Head over to [**here**](https://replicate.com/account) to view your API key, once you have created an account & connected a credit card.

## Create a Discord bot
You will need to create a Discord bot application [*here*](https://discord.com/developers/applications). The bot does not require any special intents.
Then, save the token and application ID for the next step.

## Configuration
Firstly, copy the configuration example in `src/config.example.json` to `src/config.json`, and follow all the steps inside the file.
You will have to fill out all required fields, or else the bot may not work as expected or at all.

## Building
**Firstly**, run `npm install` to obtain all the packages & depencies.
Then, run `npm run build` to build the bot.

Once built, you will be able to start the bot using `npm run start`.
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Clearing global commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: [] }  // Empty array clears all global commands
    );

    console.log('All global commands cleared.');
  } catch (error) {
    console.error('Error clearing global commands:', error);
  }
})();

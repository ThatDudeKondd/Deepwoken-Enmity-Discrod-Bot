// Import required modules
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, MessageFlags, ChannelType } = require('discord.js');

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create a new Discord client with message intent
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,  // Added this line
    ]
});

// Load settings from file or initialize empty object
const settingsPath = path.join(__dirname, 'settings.json');
let settings = {};
if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

// Helper function to save settings
function saveSettings() {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
}

// Define your slash commands
const commands = [

    new SlashCommandBuilder()
        .setName('set')
	    .setDescription('Set various bot settings')
	    .addSubcommand(subcommand =>
		    subcommand
			    .setName('ping_channel')
			    .setDescription('Set the channel where the bot pings a role when /enmity is used.')
			    .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to set for pings')
                        .setRequired(true)))
	    .addSubcommand(subcommand =>
		    subcommand
			    .setName('ping_role')
                .setDescription('Set the role to ping when /enmity is used.')
                .addRoleOption(option =>
                    option.setName('role')
                    .setDescription('The role to ping')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enmity_host_role')
                .setDescription('Set the role that is allowed to use the /enmity command.')
                .addRoleOption(option => 
                    option.setName('role')
                        .setDescription('The role that can use the /enmity command')
                        .setRequired(true))),
    new SlashCommandBuilder()
        .setName('enmity')
        .setDescription('Use this command to trigger an enmity ping in the set channel.')
        .addChannelOption(option =>
            option.setName('voicechannel')
                .setDescription('Optional voice channel to mention')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Optional message to include with the ping')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('print_settings')
        .setDescription('Print saved settings for this server.')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Optional key to get a specific setting')
                .setRequired(false)
                // Tooltips for keys currently set in this guild will be updated on interaction
        )
].map(command => command.toJSON());

// Register slash commands on bot startup
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    console.log('🚀 Clearing old guild commands...');
    const cleared = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [] }
    );
    console.log(`Cleared commands: ${JSON.stringify(cleared)}`);

    console.log('🚀 Registering slash commands...');
    const registered = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    //console.log(`Registered commands: ${JSON.stringify(registered)}`);

    console.log('✅ Slash commands registered in guild!');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
});



// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const guildId = interaction.guildId;
    if (!guildId) {
        return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    // ----- SET COMMAND -----
    if (interaction.commandName === 'set' && interaction.memberPermissions.has('Administrator')) {
    
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'ping_channel') {
            const channel = interaction.options.getChannel('channel');
            if (!channel) {
                return interaction.reply({ content: 'Please provide a valid channel.', flags: MessageFlags.Ephemeral });
            }

            settings[guildId] = {
                ...settings[guildId],
                channelId: channel.id,
            };
            saveSettings();

            return interaction.reply({ content: `✅ Ping channel set to **${channel.name}** in this server.`, flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'ping_role') {
            const role = interaction.options.getRole('role');
            if (!role) {
                return interaction.reply({ content: 'Please provide a valid role.', flags: MessageFlags.Ephemeral });
            }

            settings[guildId] = {
                ...settings[guildId],
                roleToPingId: role.id,
            };
            saveSettings();

            return interaction.reply({ content: `✅ Ping role set to **${role.name}** in this server.`, flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'enmity_host_role') {
            const role = interaction.options.getRole('role');
            if (!role) {
                return interaction.reply({ content: 'Please provide a valid role.', flags: MessageFlags.Ephemeral });
            }

            settings[guildId] = {
                ...settings[guildId],
                enmityHostRoleId: role.id,
            };
            saveSettings();

            return interaction.reply({ content: `✅ Enmity host role set to **${role.name}** in this server.`, flags: MessageFlags.Ephemeral });
        }
    }

    // ----- ENMITY COMMAND -----
    if (interaction.commandName === 'enmity') {
        const message = interaction.options.getString('message') || '';
        const voiceChannel = interaction.options.getChannel('voicechannel'); // use exact option name
        const guildSettings = settings[guildId] || {};

        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (!member.roles.cache.has(guildSettings.enmityHostRoleId)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        if (!guildSettings.channelId || !guildSettings.roleToPingId) {
            return interaction.reply({ content: 'Please set both the ping channel and role first.', flags: MessageFlags.Ephemeral });
        }

        const channel = client.channels.cache.get(guildSettings.channelId);
        const roleToPing = `<@&${guildSettings.roleToPingId}>`;

        if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(channel.type)) {
            return interaction.reply({ content: 'The specified ping channel is not valid.', flags: MessageFlags.Ephemeral });
        }

        // Get voice channel option (optional)


    try {
        let content = `${roleToPing} ${interaction.user} is hosting an enmity.`;

        if (message && voiceChannel) {
            content += ` They're saying: ${message}. Get on this VC whenever you're ready! <#${voiceChannel.id}>`;
        } else if (message) {
            content += ` They're saying: ${message}.`;
        } else if (voiceChannel) {
            content += ` Get on this VC whenever you're ready! <#${voiceChannel.id}>`;
        }

        await channel.send(content);
        await interaction.reply({ content: '✅ Enmity ping sent!', flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ Failed to send the enmity ping.', flags: MessageFlags.Ephemeral });
    }


}

    // ----- PRINT SETTINGS COMMAND -----
    if (interaction.commandName === 'print_settings') {
        const key = interaction.options.getString('key');

        if (!settings[guildId]) {
            return interaction.reply({ content: 'No settings saved for this server.', flags: MessageFlags.Ephemeral });
        }

        if (key) {
            const value = settings[guildId][key];
            if (value === undefined) {
                return interaction.reply({ content: `No setting found for key: \`${key}\``, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({ content: `**${key}**: \`${value}\``, flags: MessageFlags.Ephemeral });
        }

        let response = '**Current settings for this server:**\n';
        for (const [k, v] of Object.entries(settings[guildId])) {
            response += `**${k}**: \`${v}\`\n`;
        }
        return interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
    }
});


// Message-based "hello" response
client.on('messageCreate', message => {
    if (message.author.bot) return;

    if (message.content.toLowerCase() === 'hello') {
        message.reply('Hi there! 👋 I am your friendly bot.');
    }
});

// Log in to Discord using token from .env
client.login(process.env.DISCORD_TOKEN);

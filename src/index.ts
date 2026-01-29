// src/index.ts
import { Client, GatewayIntentBits, TextChannel, Message, REST, Routes, SlashCommandBuilder, EmbedBuilder, Events, MessageFlags } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Configuration
const MEOW_CHANNEL_ID = process.env.MEOW_CHANNEL_ID || '';
const TALLY_FILE = path.join(__dirname, '../data/tallies.json');
const IMMUNE_FILE = path.join(__dirname, '../data/immune.json');
const WEEKLY_RESET_DAY = 1; // Monday (0 = Sunday, 1 = Monday, etc.)
const WEEKLY_RESET_HOUR = 12; // Noon
const OWNER_ID = '1125844710511104030';

interface Tallies {
  [userId: string]: number;
}

interface ImmuneUsers {
  [userId: string]: boolean;
}

let tallies: Tallies = {};
let immuneUsers: ImmuneUsers = {};

// Load tallies from file
function loadTallies(): void {
  try {
    const dataDir = path.dirname(TALLY_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (fs.existsSync(TALLY_FILE)) {
      const data = fs.readFileSync(TALLY_FILE, 'utf-8');
      tallies = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tallies:', error);
    tallies = {};
  }
}

// Save tallies to file
function saveTallies(): void {
  try {
    const dataDir = path.dirname(TALLY_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(TALLY_FILE, JSON.stringify(tallies, null, 2));
  } catch (error) {
    console.error('Error saving tallies:', error);
  }
}

// Load immune users from file
function loadImmuneUsers(): void {
  try {
    const dataDir = path.dirname(IMMUNE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (fs.existsSync(IMMUNE_FILE)) {
      const data = fs.readFileSync(IMMUNE_FILE, 'utf-8');
      immuneUsers = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading immune users:', error);
    immuneUsers = {};
  }
}

// Save immune users to file
function saveImmuneUsers(): void {
  try {
    const dataDir = path.dirname(IMMUNE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(IMMUNE_FILE, JSON.stringify(immuneUsers, null, 2));
  } catch (error) {
    console.error('Error saving immune users:', error);
  }
}

// Check if message is a valid meow variant, emoji, or emoticon
function isValidMeow(content: string): boolean {
  const cleaned = content.trim();
  
  // Empty message
  if (!cleaned) return false;
  
  // MUST contain at least one meow variant
  const hasMeow = /m+[erow]+[wow]*/i.test(cleaned);
  
  // If no meow found, it's invalid
  if (!hasMeow) return false;
  
  // Remove all meow patterns first
  let withoutMeows = cleaned.replace(/m+[erow]+[wow]*/gi, '');
  
  // Remove all emojis and unicode symbols
  withoutMeows = withoutMeows.replace(/[\p{Emoji}\p{Emoji_Component}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Modifier_Base}]/gu, '');
  
  // Remove all common emoticon letters and symbols
  // Letters: T, w, u, v, o, O, x, X, d, D, p, P, b, B, c, C, n, N, q, Q, etc.
  // Symbols: all punctuation and special characters
  withoutMeows = withoutMeows.replace(/[TwWuUvVoO0xXdDpPbBcCnNqQsSzZaAeEiIyYrRhHkKlLfFgGjJ:;=\-_^><()[\]{}|/\\*~`'".,!?@#$%&+\s]/g, '');
  
  // If nothing left after removing meows, emojis, and valid emoticon characters, it's valid
  return withoutMeows.length === 0;
}

// Handle non-meow messages
async function handleNonMeow(message: Message): Promise<void> {
  const userId = message.author.id;
  
  // Check if user is immune
  if (immuneUsers[userId]) {
    return; // Skip punishment for immune users
  }
  
  // Increment tally
  tallies[userId] = (tallies[userId] || 0) + 1;
  saveTallies();
  
  // Send warning message
  const warningMessage = await message.reply(
    `❌ **Meow?!** ${message.author}, this is a meow-only zone! That's strike **${tallies[userId]}** for you! 😾`
  );
  
  // Delete both messages after 5 seconds
  setTimeout(async () => {
    try {
      await message.delete();
      await warningMessage.delete();
    } catch (error) {
      console.error('Error deleting messages:', error);
    }
  }, 5000);
}

// Weekly announcement and reset
async function weeklyAnnouncementAndReset(): Promise<void> {
  if (!MEOW_CHANNEL_ID) return;
  
  try {
    const channel = await client.channels.fetch(MEOW_CHANNEL_ID) as TextChannel;
    
    if (!channel) return;
    
    const entries = Object.entries(tallies);
    
    if (entries.length === 0) {
      await channel.send('meow 😺');
      return;
    }
    
    // Sort by tallies
    entries.sort((a, b) => b[1] - a[1]);
    
    const mostTallies = entries[0];
    const leastTallies = entries[entries.length - 1];
    
    let announcement = '📊 **Weekly Meow Report** 📊\n\n';
    
    // Most tallies (worst offender)
    announcement += `🙀 **Most Non-Meows:** <@${mostTallies[0]}> with **${mostTallies[1]}** strike(s)!\n`;
    
    // Least tallies (best meower) - only if different from worst
    if (entries.length > 1 && leastTallies[1] < mostTallies[1]) {
      announcement += `😺 **Fewest Non-Meows:** <@${leastTallies[0]}> with only **${leastTallies[1]}** strike(s)!\n`;
    } else if (entries.length === 1) {
      announcement += `😺 **Only participant:** <@${leastTallies[0]}>\n`;
    }
    
    announcement += '\n✨ Tallies have been reset! ✨\n\nmeow';
    
    await channel.send(announcement);
    
    // Reset tallies
    tallies = {};
    saveTallies();
    
  } catch (error) {
    console.error('Error in weekly announcement:', error);
  }
}

// Calculate time until next weekly reset
function getTimeUntilNextReset(): number {
  const now = new Date();
  const next = new Date();
  
  // Set to the target day and hour
  next.setHours(WEEKLY_RESET_HOUR, 0, 0, 0);
  
  const currentDay = now.getDay();
  const daysUntilReset = (WEEKLY_RESET_DAY - currentDay + 7) % 7;
  
  if (daysUntilReset === 0 && now.getHours() >= WEEKLY_RESET_HOUR) {
    // If it's today but already passed, schedule for next week
    next.setDate(next.getDate() + 7);
  } else {
    next.setDate(next.getDate() + daysUntilReset);
  }
  
  return next.getTime() - now.getTime();
}

// Get next reset date
function getNextResetDate(): Date {
  const now = new Date();
  const next = new Date();
  
  next.setHours(WEEKLY_RESET_HOUR, 0, 0, 0);
  
  const currentDay = now.getDay();
  const daysUntilReset = (WEEKLY_RESET_DAY - currentDay + 7) % 7;
  
  if (daysUntilReset === 0 && now.getHours() >= WEEKLY_RESET_HOUR) {
    next.setDate(next.getDate() + 7);
  } else {
    next.setDate(next.getDate() + daysUntilReset);
  }
  
  return next;
}

// Format time remaining
function formatTimeRemaining(milliseconds: number): string {
  const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
  const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  
  return parts.join(', ') || 'less than a minute';
}

// Schedule weekly reset
function scheduleWeeklyReset(): void {
  const timeUntilReset = getTimeUntilNextReset();
  
  console.log(`Next weekly reset in ${Math.floor(timeUntilReset / 1000 / 60 / 60)} hours`);
  
  setTimeout(() => {
    weeklyAnnouncementAndReset();
    // Schedule the next one (7 days later)
    setInterval(weeklyAnnouncementAndReset, 7 * 24 * 60 * 60 * 1000);
  }, timeUntilReset);
}

// Register slash commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('immune')
      .setDescription('Toggle immunity from meow enforcement (owner only)')
      .toJSON(),
    
    new SlashCommandBuilder()
      .setName('reset')
      .setDescription('Reset a user\'s strikes')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user whose strikes to reset')
          .setRequired(true)
      )
      .toJSON(),
    
    new SlashCommandBuilder()
      .setName('when')
      .setDescription('Check when the next weekly reset will occur')
      .toJSON(),
    
    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('View the current strike leaderboard (owner only)')
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

  try {
    console.log('🔄 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands }
    );
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Bot ready event (using clientReady instead of ready)
client.on(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  loadTallies();
  loadImmuneUsers();
  scheduleWeeklyReset();
  await registerCommands();
});

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'immune') {
    // Check if user is the owner
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ 
        content: '❌ Only the bot owner can use this command!', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const userId = interaction.user.id;
    
    // Toggle immunity
    if (immuneUsers[userId]) {
      delete immuneUsers[userId];
      saveImmuneUsers();
      await interaction.reply({ 
        content: '🚫 You are no longer immune to meow enforcement!', 
        flags: MessageFlags.Ephemeral 
      });
    } else {
      immuneUsers[userId] = true;
      saveImmuneUsers();
      await interaction.reply({ 
        content: '✅ You are now immune to meow enforcement!', 
        flags: MessageFlags.Ephemeral 
      });
    }
  }

  if (interaction.commandName === 'reset') {
    const targetUser = interaction.options.getUser('user', true);
    const userId = targetUser.id;
    
    if (tallies[userId]) {
      const previousStrikes = tallies[userId];
      delete tallies[userId];
      saveTallies();
      await interaction.reply({
        content: `✅ Reset **${previousStrikes}** strike(s) for ${targetUser.tag}`,
        flags: MessageFlags.Ephemeral
      });
    } else {
      await interaction.reply({
        content: `ℹ️ ${targetUser.tag} has no strikes to reset.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.commandName === 'when') {
    const nextReset = getNextResetDate();
    const timeRemaining = getTimeUntilNextReset();
    
    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('📅 Next Weekly Reset')
      .setDescription(`The next reset will occur on:`)
      .addFields(
        { name: '🕐 Date & Time', value: `<t:${Math.floor(nextReset.getTime() / 1000)}:F>`, inline: false },
        { name: '⏱️ Time Remaining', value: formatTimeRemaining(timeRemaining), inline: false }
      )
      .setFooter({ text: 'Strikes will be reset and leaderboard announced!' })
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'leaderboard') {
    // Check if user is the owner
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ 
        content: '❌ Only the bot owner can use this command!', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const entries = Object.entries(tallies);
    
    if (entries.length === 0) {
      await interaction.reply({
        content: '✅ No strikes recorded yet! Everyone is being good meowers! 😺',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Sort by tallies (highest first)
    entries.sort((a, b) => b[1] - a[1]);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🏆 Strike Leaderboard')
      .setDescription('Current standings for non-meow violations')
      .setTimestamp();

    // Build leaderboard string
    let leaderboardText = '';
    for (let i = 0; i < Math.min(entries.length, 25); i++) {
      const [userId, strikes] = entries[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      leaderboardText += `${medal} <@${userId}>: **${strikes}** strike${strikes !== 1 ? 's' : ''}\n`;
    }

    embed.addFields({ name: 'Rankings', value: leaderboardText || 'No data', inline: false });
    
    const nextReset = getNextResetDate();
    embed.setFooter({ text: `Next reset: ${nextReset.toLocaleDateString()} at ${nextReset.toLocaleTimeString()}` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
});

// Message handler
client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Check if it's the meow channel
  if (message.channelId !== MEOW_CHANNEL_ID) return;
  
  // Check if message is a valid meow
  if (!isValidMeow(message.content)) {
    await handleNonMeow(message);
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
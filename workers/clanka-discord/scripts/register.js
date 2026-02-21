const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const TOKEN = process.env.DISCORD_TOKEN;

const COMMANDS = [
  {
    name: 'status',
    description: 'Check Clanka system status',
  },
  {
    name: 'review',
    description: 'Get a summary of a GitHub PR',
    options: [
      {
        type: 3, // STRING
        name: 'pr_url',
        description: 'The URL of the GitHub PR',
        required: true,
      },
    ],
  },
  {
    name: 'feedback',
    description: 'Check latest user feedback entries',
    options: [
      {
        type: 4, // INTEGER
        name: 'limit',
        description: 'Number of entries to fetch (default 5)',
        required: false,
      },
    ],
  }
];

async function register() {
  if (!APPLICATION_ID || !TOKEN) {
    console.error('Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN');
    process.exit(1);
  }

  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  });

  if (response.ok) {
    console.log('Successfully registered commands');
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error('Error registering commands');
    const error = await response.text();
    console.error(error);
  }
}

register();

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
  },
  {
    name: 'help',
    description: 'Show available commands',
  }
];

function parseCliArgs(argv = process.argv.slice(2)) {
  return {
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printJson(log, payload) {
  log(JSON.stringify(payload, null, 2));
}

async function registerCommands({
  applicationId = process.env.DISCORD_APPLICATION_ID,
  token = process.env.DISCORD_TOKEN,
  fetchImpl = fetch,
  log = console.log,
  errorLog = console.error,
  argv = process.argv.slice(2),
} = {}) {
  const flags = parseCliArgs(argv);

  if (flags.help) {
    const usage = 'Usage: node scripts/register.js [--json]';
    if (flags.json) {
      printJson(log, {
        ok: true,
        usage,
        options: ['--json', '--help'],
        commands: COMMANDS.map((command) => command.name),
      });
    } else {
      log(usage);
      log('Options:');
      log('  --json   Output machine-readable JSON result');
      log('  --help   Show this help');
    }
    return { ok: true, help: true };
  }

  if (!applicationId || !token) {
    const error = 'Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN';
    if (flags.json) {
      printJson(log, { ok: false, error });
    } else {
      errorLog(error);
    }
    return { ok: false, error };
  }

  const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(COMMANDS),
    });
  } catch (err) {
    const error =
      err instanceof Error ? err.message : 'Network error during command registration';
    if (flags.json) {
      printJson(log, { ok: false, error });
    } else {
      errorLog('Error registering commands');
      errorLog(error);
    }
    return { ok: false, error };
  }

  if (response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (flags.json) {
      printJson(log, {
        ok: true,
        commandCount: COMMANDS.length,
        data,
      });
    } else {
      log('Successfully registered commands');
      log(JSON.stringify(data, null, 2));
    }

    return { ok: true, data };
  }

  let error = 'Error registering commands';
  try {
    const text = await response.text();
    if (text) {
      error = text;
    }
  } catch {
    // Keep default error
  }

  if (flags.json) {
    printJson(log, { ok: false, status: response.status, error });
  } else {
    errorLog('Error registering commands');
    errorLog(error);
  }

  return { ok: false, status: response.status, error };
}

async function main(argv = process.argv.slice(2)) {
  const result = await registerCommands({ argv });
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  COMMANDS,
  parseCliArgs,
  registerCommands,
  main,
};

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stagingEnvPath = resolve('.staging-secrets/client.config');
const productionEnvPath = resolve('.env');

if (!existsSync(stagingEnvPath)) {
  fail(
    'Missing .staging-secrets/client.config. Copy .env.staging.example there and add the staging Supabase values.'
  );
}

const stagingEnvironment = readEnvironmentFile(stagingEnvPath);
const stagingUrl = stagingEnvironment.EXPO_PUBLIC_SUPABASE_URL;
const stagingAnonKey = stagingEnvironment.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!stagingUrl || !stagingAnonKey) {
  fail(
    '.staging-secrets/client.config must define EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

if (existsSync(productionEnvPath)) {
  const productionEnvironment = readEnvironmentFile(productionEnvPath);

  if (productionEnvironment.EXPO_PUBLIC_SUPABASE_URL === stagingUrl) {
    fail('The staging Supabase URL matches production. Refusing to start Expo.');
  }
}

const expoArguments = ['expo', 'start', '--clear', ...process.argv.slice(2)];
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(command, expoArguments, {
  env: {
    ...process.env,
    ...stagingEnvironment,
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  fail(`Unable to start Expo with staging: ${error.message}`);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function readEnvironmentFile(path) {
  const environment = {};

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    environment[key] = value;
  }

  return environment;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

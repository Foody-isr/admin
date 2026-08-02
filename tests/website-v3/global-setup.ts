import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const defaultRestaurantSlug = 'website-v3-e2e';

export interface WebsiteV3FixtureData {
  restaurantId: number;
  restaurantSlug: string;
  email: string;
  password: string;
  menuIds: number[];
  serviceIds: number[];
}

interface SeedOutput {
  restaurant_id: number;
  restaurant_slug: string;
  email: string;
  password: string;
  menu_ids: number[];
  service_ids: number[];
}

/** Runs the deterministic server seed and persists its credentials for E2E workers. */
export default async function globalSetup(): Promise<void> {
  await seedWebsiteV3Fixture();
}

/** Recreates the deterministic Website V3 fixture and persists its credentials. */
export async function seedWebsiteV3Fixture(): Promise<WebsiteV3FixtureData> {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const serverDirectory = path.join(repositoryRoot, 'foodyserver');
  const restaurantSlug = process.env.WEBSITE_V3_E2E_RESTAURANT_SLUG ?? defaultRestaurantSlug;
  const databaseURL =
    process.env.WEBSITE_V3_E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@127.0.0.1:55432/foody?sslmode=disable';
  const { stdout } = await execFileAsync(
    'go',
    ['run', './cmd/websitev3seed', '--restaurant-slug', restaurantSlug],
    {
      cwd: serverDirectory,
      env: { ...process.env, DATABASE_URL: databaseURL },
      maxBuffer: 1024 * 1024,
    },
  );
  const fixture = parseSeedOutput(stdout);
  const fixturePath = getFixturePath(repositoryRoot);

  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  return fixture;
}

/** Returns the absolute path of the fixture produced by the global setup. */
export function getFixturePath(repositoryRoot = path.resolve(__dirname, '../../..')): string {
  return path.join(repositoryRoot, 'foodyadmin', 'test-results', 'website-v3-fixture.json');
}

/** Parses the final JSON line emitted by the deterministic Website V3 seed command. */
export function parseSeedOutput(stdout: string): WebsiteV3FixtureData {
  const finalLine = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith('{'));

  if (!finalLine) {
    throw new Error('Website V3 seed did not emit a JSON fixture line.');
  }

  let output: SeedOutput;
  try {
    output = JSON.parse(finalLine) as SeedOutput;
  } catch (error) {
    throw new Error(`Website V3 seed emitted invalid JSON: ${String(error)}`);
  }

  if (
    !Number.isInteger(output.restaurant_id) ||
    output.restaurant_id <= 0 ||
    !output.restaurant_slug ||
    !output.email ||
    !output.password ||
    !Array.isArray(output.menu_ids) ||
    !Array.isArray(output.service_ids)
  ) {
    throw new Error('Website V3 seed fixture is missing required fields.');
  }

  return {
    restaurantId: output.restaurant_id,
    restaurantSlug: output.restaurant_slug,
    email: output.email,
    password: output.password,
    menuIds: output.menu_ids,
    serviceIds: output.service_ids,
  };
}

/** Parse actual emitted wrappers using the same profile validator as the runtime. */
import { readFileSync } from 'node:fs';
import { validateLottie } from '../../packages/shared/src/lottie';
import { lottieProfile } from '../../packages/shared/src/lottie-motion';

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node24: nvm use');
const fixtures = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as {
  id: string;
  file: string;
  document: unknown;
  resources: number;
}[];
for (const fixture of fixtures) {
  const parsed = validateLottie(fixture.document, fixture.file, lottieProfile(fixture.id));
  if (parsed.images.length !== fixture.resources)
    throw new Error(`Wrong genuine resource count: ${fixture.id}`);
}
process.stdout.write(JSON.stringify({ parsed: fixtures.length }) + '\n');

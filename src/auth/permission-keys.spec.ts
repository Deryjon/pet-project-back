import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from './permissions.decorator';
import { PERMISSION_ALIASES } from './role-permissions';
import { getPermissionIdsBySlug } from '../roles/roles.permissions';

// A slug that is not in the permission tree never matches a role, so a typo
// in @Permissions/@AnyPermission silently makes a route admin-only.
function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

function slugsOf(target: object): string[] {
  return [PERMISSIONS_KEY, ANY_PERMISSIONS_KEY].flatMap(
    (key) => (Reflect.getMetadata(key, target) as string[] | undefined) ?? [],
  );
}

const usages: Array<{ where: string; slug: string }> = [];
for (const file of controllerFiles(join(__dirname, '..'))) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exported = require(file) as Record<string, unknown>;
  for (const [name, value] of Object.entries(exported)) {
    if (typeof value !== 'function') continue;
    const controller = value as { prototype: Record<string, unknown> };
    for (const slug of slugsOf(controller)) usages.push({ where: name, slug });
    for (const method of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[method];
      if (method === 'constructor' || typeof handler !== 'function') continue;
      for (const slug of slugsOf(handler)) {
        usages.push({ where: `${name}.${method}`, slug });
      }
    }
  }
}

describe('Permission keys used by controllers', () => {
  it('finds the permission-guarded routes', () => {
    expect(usages.length).toBeGreaterThan(50);
  });

  it('only uses slugs that exist in the permission tree', () => {
    const unknown = usages.filter(
      ({ slug }) =>
        (PERMISSION_ALIASES[slug] ?? [slug]).flatMap(getPermissionIdsBySlug)
          .length === 0,
    );
    expect(unknown).toEqual([]);
  });
});

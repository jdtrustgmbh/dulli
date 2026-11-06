// The app ships as ONE stylesheet and ONE script. The individual files stay in public/ as the readable sources; the server
// glues them together in the order below (the CSS order is the cascade order, the JS order is the start-up order).
// Because the stylesheet sits in <head> and blocks painting, the first frame already has the complete design.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CSS_FILES = [
  'css/foundation.css', 'css/today.css', 'css/forms.css', 'css/modules.css', 'css/planner.css', 'css/tokens.css', 'css/theme.css',
  'features/settings.css', 'features/calendar-views.css', 'features/tasks-plus.css', 'features/treasures.css',
  'features/meals-plus.css', 'features/lists-plus.css', 'features/photo-frame.css', 'features/child-lock.css',
  'features/profiles-plus.css', 'features/hub-pages.css', 'features/theme-extras.css',
  'css/controls.css', 'css/mobile.css', 'css/dark.css'
];

export const JS_FILES = [
  'js/navigation.js', 'js/optional.js',
  'js/i18n-ui.js', 'js/school-ui.js', 'js/calendar-ui.js', 'js/density-ui.js',
  'js/today.js', 'js/module-actions.js', 'js/provider-ui.js', 'js/ownership-ui.js', 'js/enhancements.js',
  'js/wizard-ui.js', 'js/calendar-week-ui.js', 'js/moon-ui.js', 'js/members-ui.js', 'js/routines-ui.js',
  'features/extras.js', 'features/shell.js', 'features/settings.js', 'features/calendar-views.js', 'features/holidays.js',
  'features/tasks-plus.js', 'features/treasures.js', 'features/meals-plus.js', 'features/recipes-kids.js',
  'features/lists-plus.js', 'features/photo-frame.js', 'features/child-lock.js', 'features/profiles-plus.js',
  'features/hub-pages.js', 'features/theme-extras.js'
];

// Everything is in: the markup was rebuilt by the scripts above, so the page may be shown (index.html hides it until now).
const REVEAL = ";(() => { const show = () => document.documentElement.classList.remove('jd-boot'); setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(show)), 120); })();\n";

export const BUNDLE_PATHS = { '/dulli.css': 'css', '/dulli.js': 'js' };

export async function buildBundle(root, requested) {
  const kind = BUNDLE_PATHS[requested]; if (!kind) return null;
  const files = kind === 'css' ? CSS_FILES : JS_FILES;
  const parts = await Promise.all(files.map(async file => `/* ${file} */\n${await readFile(join(root, file), 'utf8')}`));
  const body = kind === 'css' ? parts.join('\n') : parts.join('\n;\n') + '\n;\n' + REVEAL;
  return { content: Buffer.from(body), type: kind === 'css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' };
}

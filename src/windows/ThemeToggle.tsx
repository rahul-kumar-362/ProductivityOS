import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/shared/components/ui/IconButton';
import { useSettingsStore } from '@/stores/settings.store';
import { resolveTheme } from '@/lib/theme/applyTheme';

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const resolved = resolveTheme(theme);
  return (
    <IconButton
      label="Toggle theme"
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
    >
      {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </IconButton>
  );
}

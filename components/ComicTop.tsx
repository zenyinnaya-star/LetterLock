'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { SettingsButton } from './SettingsPanel';
import { getPrefs, setPref } from '@/lib/prefs';
import { useT } from '@/lib/i18n/react';

/** The two round comic buttons top-right (music + settings) used on the landing and play screens. */
export function ComicTop() {
  const t = useT();
  const [musicOn, setMusicOn] = useState(true);
  useEffect(() => {
    const sync = () => setMusicOn(getPrefs().music);
    sync();
    window.addEventListener('letterlock:mute', sync);
    return () => window.removeEventListener('letterlock:mute', sync);
  }, []);
  return (
    <div className="cp-icons">
      <button type="button" className={`iconbtn${musicOn ? '' : ' off'}`} aria-pressed={musicOn}
        aria-label={musicOn ? t('hd.music_off') : t('hd.music_on')} title={musicOn ? t('hd.music_off') : t('hd.music_on')}
        onClick={() => setPref('music', !getPrefs().music)}>
        <Icon name={musicOn ? 'music' : 'musicoff'} />
      </button>
      <SettingsButton state={null} token={null} />
    </div>
  );
}
